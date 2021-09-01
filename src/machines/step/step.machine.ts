import { assign, actions } from 'xstate';
import { createModel } from 'xstate/lib/model';

import {
  Action,
  ActionTypes,
  UpdateMultipleStepsIsRequiredAction,
  UpdateMultipleStepsVisibilityAction,
  UpdateStepIsRequiredAction,
  UpdateStepVisibilityAction,
} from 'types/actions';
import { StepTypes } from 'types/steps';
import { Knockout, StepContext, StepEvent, StepQuestion } from './step.types';
import {
  createSelector,
  createSelectorHook,
  ExtractModelEvent,
} from 'machines/utils';
import { findActionInQueue, hasActionInQueue } from 'machines/utils';
import { ChildStep, StepSummary } from 'machines/workflow/workflow.types';
import { ActionsQueueItem } from 'machines/question/question.types';
import { syncFormValuesMachine } from 'machines/syncFormValuesMachine';
import { stepActions } from './step.actions';

export const stepModel = createModel(
  {
    applicationSubmitted: false,
    stepID: '',
    nextStepID: '',
    childSteps: [] as ChildStep[],
    values: {} as Record<string, string>,
    initialValues: {} as Record<string, string>,
    hasNewValues: false,
    parentUpdated: false,
    hasPassWorkflow: false,
    stepSummary: [] as StepSummary,
    knockouts: [] as Knockout[],
    questionActionsQueue: [] as ActionsQueueItem[],
    wasSubmitted: false,
    depInitialValuesSent: false,
    submitErrorMessage: '',
  },
  {
    events: {
      SUBMIT: (payload: {
        values: Record<string, string>;
        stepSummary: StepSummary;
      }) => ({ payload }),
      SYNC_VALUES: () => ({}),
      RECEIVE_QUESTION_UPDATE: (payload: {
        actionsQueue: ActionsQueueItem[];
        isKnockout: boolean;
        questionID: string;
      }) => ({ payload }),
      UPDATE_CHILD_STEP_VISIBILITY: (
        updateStepVisibilityAction: UpdateStepVisibilityAction,
        evaluationResult: boolean,
      ) => ({ updateStepVisibilityAction, evaluationResult }),
      UPDATE_CHILD_STEP_REQUIRED: (
        updateStepIsRequiredAction: UpdateStepIsRequiredAction,
        evaluationResult: boolean,
      ) => ({ updateStepIsRequiredAction, evaluationResult }),
      REMOVE_ACTION_FROM_QUEUE: (actionToRemove: Action) => ({
        actionToRemove,
      }),
      UPDATE_MULTI_STEP_VISIBILITY: (
        updateMultiStepVisibilityAction: UpdateMultipleStepsVisibilityAction,
        evaluationResult: boolean,
      ) => ({ updateMultiStepVisibilityAction, evaluationResult }),
      UPDATE_MULTI_STEP_REQUIRED: (
        updateMultiStepRequiredAction: UpdateMultipleStepsIsRequiredAction,
        evaluationResult: boolean,
      ) => ({ updateMultiStepRequiredAction, evaluationResult }),
      SEND_RESPONSES_SUCCESS: () => ({}),
      SEND_APPLICATION_SUCCESS: () => ({}),
      SUBMISSION_FAILED: (errorMessage: string) => ({ errorMessage }),
      RETRY: () => ({}),
      BACK: () => ({}),
    },
  },
);

const stepMachine = stepModel.createMachine(
  {
    id: 'step',
    initial: 'initializing',
    context: stepModel.initialContext,
    on: {
      RECEIVE_QUESTION_UPDATE: {
        target: '#checkingActionsQueue',
        actions: [stepActions.setUpdatesFromQuestionToContext],
      },
    },
    states: {
      initializing: {
        id: 'initializing',
        entry: [
          stepActions.setInitialValues,
          stepActions.initializeChildSteps,
          stepActions.sendConditionalRefs,
          stepActions.sendDataSourceRefs,
        ],
        always: [{ target: 'initialized' }],
      },
      initialized: {
        id: 'initialized',
        type: 'parallel',
        states: {
          form: {
            id: 'form',
            initial: 'idle',
            on: {
              SYNC_VALUES: {
                target: '#form.syncingValues',
              },
            },
            states: {
              idle: {
                id: 'idle',
                on: {
                  SUBMIT: {
                    target: 'submitting',
                    actions: [stepActions.setFormDetailsToContext],
                  },
                },
              },
              syncingValues: {
                invoke: {
                  src: syncFormValuesMachine,
                  data: (context) => {
                    const { childSteps, values } = context;
                    const questionRefs = childSteps
                      .filter(
                        (childStep): childStep is StepQuestion =>
                          childStep.stepType === StepTypes.QUESTION,
                      )
                      .map((childStep) => childStep.ref);

                    return {
                      currentValues: values,
                      questionRefs,
                    };
                  },
                  onDone: {
                    target: '#idle',
                    actions: [stepActions.assignReturnedValues],
                  },
                  onError: {
                    target: '#idle',
                  },
                },
              },
              submitting: {
                id: 'submitting',
                initial: 'checkingSubmittedValues',
                on: {
                  SUBMISSION_FAILED: {
                    target: '#form.submittingFailed',
                    actions: [
                      stepModel.assign({
                        submitErrorMessage: (_context, event) =>
                          event.errorMessage,
                      }),
                    ],
                  },
                },
                states: {
                  checkingSubmittedValues: {
                    always: [
                      {
                        target: 'sendingWorkflowResponses',
                        cond: 'isKnockout',
                      },
                      {
                        target: '#idle',
                        cond: 'isClean',
                        actions: [stepActions.sendParentNextStep],
                      },
                      {
                        target: 'sendingWorkflowResponses',
                        cond: 'hasNewValues',
                      },
                      {
                        target: 'submittingApplication',
                        cond: 'canSubmitApplication',
                      },
                      {
                        target: '#idle',
                        actions: [
                          stepActions.sendSummaryToParent,
                          assign<StepContext, StepEvent>((context) => ({
                            parentUpdated: true,
                          })),
                          stepActions.sendParentNextStep,
                        ],
                      },
                    ],
                  },
                  sendingWorkflowResponses: {
                    id: 'sendingWorkflowResponses',
                    on: {
                      SEND_RESPONSES_SUCCESS: [
                        {
                          target: '#cancelled',
                          cond: 'isKnockout',
                        },
                        {
                          target: 'checkingSubmittedValues',
                          actions: [
                            stepActions.sendSummaryToParent,
                            assign<
                              StepContext,
                              ExtractModelEvent<
                                typeof stepModel,
                                'SEND_RESPONSES_SUCCESS'
                              >
                            >({
                              hasNewValues: false,
                              parentUpdated: true,
                            }),
                          ],
                        },
                      ],
                    },
                  },
                  submittingApplication: {
                    id: 'submittingApplication',
                    on: {
                      SEND_APPLICATION_SUCCESS: [
                        {
                          target: '#idle',
                          cond: 'parentNeedsUpdate',
                          actions: [
                            stepActions.sendSummaryToParent,
                            stepModel.assign({
                              parentUpdated: true,
                            }),
                            stepActions.sendParentNextStep,
                          ],
                        },
                        {
                          target: '#idle',
                          actions: [stepActions.sendParentNextStep],
                        },
                      ],
                    },
                  },
                  hist: {
                    type: 'history',
                  },
                },
              },
              submittingFailed: {
                on: {
                  RETRY: {
                    target: '#submitting.hist',
                  },
                  BACK: {
                    target: '#idle',
                    actions: [stepModel.assign({ submitErrorMessage: '' })],
                  },
                },
              },
              cancelled: {
                id: 'cancelled',
                type: 'final',
              },
            },
          },
          conditionalActions: {
            id: 'conditionalActions',
            initial: 'checkingActionsQueue',
            states: {
              checkingActionsQueue: {
                /**
                 * In the `performingActions` state we first want to check which action needs to be performed. First it will check for an
                 * `updateStepVisibility` action, if it exists in the queue it will transition to the `updatingChildStepVisibility` state where that
                 * action will be performed, then it will remove that action from the queue and  transition back to this `checkingActionsQueue` state.
                 * That process is repeated until there are no `updateStepVisibility` actions left in the queue, then it will do the same for all of
                 * the `updateStepIsRequired` actions. When there are no actions left in the queue, the machine will return to the `idle` state.
                 */
                id: 'checkingActionsQueue',
                always: [
                  {
                    target: 'updatingMultipleStepVisibility',
                    cond: 'hasUpdateMultipleStepVisibility',
                  },
                  {
                    target: 'updatingMultipleStepRequired',
                    cond: 'hasUpdateMultipleStepIsRequired',
                  },
                  {
                    target: 'updatingChildStepVisibility',
                    cond: 'hasUpdateStepVisibilityAction',
                  },
                  {
                    target: 'updatingChildStepRequired',
                    cond: 'hasUpdateStepRequiredAction',
                  },
                  { target: '#conditionalActionsIdle' },
                ],
              },
              idle: {
                id: 'conditionalActionsIdle',
              },
              updatingChildStepVisibility: {
                id: 'updatingChildStepVisibility',
                /**
                 * Upon entering the `updatingChildStepVisibility` state we get the first conditional action in the queue that contains an
                 * `updateStepVisibility` action. Then we send an event (to this current state) with the action itself as well as the
                 * `evaluationResult` (which is determined within the questionMachine).
                 */
                entry: actions.send((context) => {
                  const { questionActionsQueue } = context;
                  const queuedAction = findActionInQueue(
                    questionActionsQueue,
                    ActionTypes.UPDATESTEPVISIBILITY,
                  );

                  const updateStepVisibilityAction =
                    queuedAction?.actions?.find(
                      (action): action is UpdateStepVisibilityAction =>
                        action.actionType === ActionTypes.UPDATESTEPVISIBILITY,
                    );
                  return {
                    type: 'UPDATE_CHILD_STEP_VISIBILITY',
                    updateStepVisibilityAction,
                    evaluationResult: queuedAction?.evaluationResult,
                  };
                }),
                on: {
                  UPDATE_CHILD_STEP_VISIBILITY: {
                    actions: [
                      /**
                       * Here we call the XState action that will tell the child step to update its visibility. Then we send the
                       * 'REMOVE_ACTION_FROM_QUEUE' event with the `updateStepVisibility` action attached, there the action that was just performed
                       * will be removed from the queue.
                       */
                      stepActions.updateChildStepVisibility,
                      actions.send((_context, event) => ({
                        type: 'REMOVE_ACTION_FROM_QUEUE',
                        actionToRemove: event.updateStepVisibilityAction,
                      })),
                    ],
                  },
                  REMOVE_ACTION_FROM_QUEUE: {
                    target: 'checkingActionsQueue',
                    actions: [stepActions.removeActionFromQueue],
                  },
                },
              },
              updatingChildStepRequired: {
                id: 'updatingChildStepRequired',
                /**
                 * Upon entering the `updatingChildStepRequired` state we get the first conditional action in the queue that contains an
                 * `updateStepIsRequired` action. Then we send an event (to this current state) with the action itself as well as the
                 * `evaluationResult` (which is determined within the questionMachine).
                 */
                entry: actions.send((context) => {
                  const { questionActionsQueue } = context;
                  const queuedAction = findActionInQueue(
                    questionActionsQueue,
                    ActionTypes.UPDATESTEPISREQUIRED,
                  );
                  const updateStepIsRequiredAction =
                    queuedAction?.actions?.find(
                      (action): action is UpdateStepIsRequiredAction =>
                        action.actionType === ActionTypes.UPDATESTEPISREQUIRED,
                    );
                  return {
                    type: 'UPDATE_CHILD_STEP_REQUIRED',
                    updateStepIsRequiredAction,
                    evaluationResult: queuedAction?.evaluationResult,
                  };
                }),
                on: {
                  UPDATE_CHILD_STEP_REQUIRED: {
                    /**
                     * Here we call the XState action that will tell the child step to update its required state. Then we send the
                     * 'REMOVE_ACTION_FROM_QUEUE' event with the `updateStepIsRequired` action attached, there the action that was just performed
                     * will be removed from the queue.
                     */
                    actions: [
                      stepActions.updateChildStepRequired,
                      actions.send((_context, event) => ({
                        type: 'REMOVE_ACTION_FROM_QUEUE',
                        actionToRemove: event.updateStepIsRequiredAction,
                      })),
                    ],
                  },
                  REMOVE_ACTION_FROM_QUEUE: {
                    target: 'checkingActionsQueue',
                    actions: [stepActions.removeActionFromQueue],
                  },
                },
              },
              updatingMultipleStepVisibility: {
                id: 'updatingMultipleStepVisibility',
                entry: actions.send((context) => {
                  const { questionActionsQueue } = context;
                  const queuedAction = findActionInQueue(
                    questionActionsQueue,
                    ActionTypes.UPDATEMULTIPLESTEPVISIBILITY,
                  );
                  const updateMultiStepVisibilityAction =
                    queuedAction?.actions?.find(
                      (action): action is UpdateMultipleStepsVisibilityAction =>
                        action.actionType ===
                        ActionTypes.UPDATEMULTIPLESTEPVISIBILITY,
                    );
                  return {
                    type: 'UPDATE_MULTI_STEP_VISIBILITY',
                    updateMultiStepVisibilityAction,
                    evaluationResult: queuedAction?.evaluationResult,
                  };
                }),
                on: {
                  UPDATE_MULTI_STEP_VISIBILITY: {
                    actions: [
                      stepActions.updateMultiStepChildVisibility,
                      actions.send((_context, event) => ({
                        type: 'REMOVE_ACTION_FROM_QUEUE',
                        actionToRemove: event.updateMultiStepVisibilityAction,
                      })),
                    ],
                  },
                  REMOVE_ACTION_FROM_QUEUE: {
                    target: 'checkingActionsQueue',
                    actions: [stepActions.removeActionFromQueue],
                  },
                },
              },
              updatingMultipleStepRequired: {
                id: 'updatingMultipleStepRequired',
                entry: actions.send((context) => {
                  const { questionActionsQueue } = context;
                  const queuedAction = findActionInQueue(
                    questionActionsQueue,
                    ActionTypes.UPDATEMULTIPLESTEPISREQUIRED,
                  );
                  const updateMultiStepRequiredAction =
                    queuedAction?.actions?.find(
                      (action): action is UpdateMultipleStepsIsRequiredAction =>
                        action.actionType ===
                        ActionTypes.UPDATEMULTIPLESTEPISREQUIRED,
                    );
                  return {
                    type: 'UPDATE_MULTI_STEP_REQUIRED',
                    updateMultiStepRequiredAction,
                    evaluationResult: queuedAction?.evaluationResult,
                  };
                }),
                on: {
                  UPDATE_MULTI_STEP_REQUIRED: {
                    actions: [
                      stepActions.updateMultiStepChildRequired,
                      actions.send((_context, event) => ({
                        type: 'REMOVE_ACTION_FROM_QUEUE',
                        actionToRemove: event.updateMultiStepRequiredAction,
                      })),
                    ],
                  },
                  REMOVE_ACTION_FROM_QUEUE: {
                    target: 'checkingActionsQueue',
                    actions: [stepActions.removeActionFromQueue],
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    guards: {
      /** Checks if the queue contains an `updateStepVisibility` action */
      hasUpdateStepVisibilityAction: (context) => {
        return context.questionActionsQueue
          ? hasActionInQueue(
              context.questionActionsQueue,
              ActionTypes.UPDATESTEPVISIBILITY,
            )
          : false;
      },
      /** Checks if the queue contains an `updateStepIsRequired` action */
      hasUpdateStepRequiredAction: (context) => {
        return context.questionActionsQueue
          ? hasActionInQueue(
              context.questionActionsQueue,
              ActionTypes.UPDATESTEPISREQUIRED,
            )
          : false;
      },
      /** Checks if the queue contains an `updateMultipleStepVisibility` set */
      hasUpdateMultipleStepVisibility: (context) => {
        return context.questionActionsQueue
          ? hasActionInQueue(
              context.questionActionsQueue,
              ActionTypes.UPDATEMULTIPLESTEPVISIBILITY,
            )
          : false;
      },
      /** Checks if the queue contains an `updateMultipleStepVisibility` set */
      hasUpdateMultipleStepIsRequired: (context) => {
        return context.questionActionsQueue
          ? hasActionInQueue(
              context.questionActionsQueue,
              ActionTypes.UPDATEMULTIPLESTEPISREQUIRED,
            )
          : false;
      },
      isClean: (context) =>
        Boolean(!context.hasNewValues) &&
        Boolean(!context.hasPassWorkflow) &&
        Boolean(context.parentUpdated),
      hasNewValues: (context) => Boolean(context.hasNewValues),
      canSubmitApplication: (context) =>
        Boolean(context.hasPassWorkflow) && !context.applicationSubmitted,
      isKnockout: (context) => Boolean(context.knockouts.length),
      parentNeedsUpdate: (context) => Boolean(!context.parentUpdated),
    },
  },
);

export default stepMachine;

export const useStepSelector = createSelectorHook<
  typeof stepModel,
  typeof stepMachine
>();

const createStepSelector = createSelector<typeof stepMachine>();

export const getStepID = createStepSelector((state) => state.context.stepID);

export const getChildSteps = createStepSelector(
  (state) => state.context.childSteps,
);

export const getValues = createStepSelector((state) => state.context.values);

export const getInitialValues = createStepSelector(
  (state) => state.context.initialValues,
);

export const getNextStepID = createStepSelector(
  (state) => state.context.nextStepID,
);

export const getWasSubmitted = createStepSelector(
  (state) => state.context.wasSubmitted,
);

export const getHasPassWorkflow = createStepSelector(
  (state) => state.context.hasPassWorkflow,
);

export const getKnockouts = createStepSelector(
  (state) => state.context.knockouts,
);

export const getSubmitErrorMessage = createStepSelector(
  (state) => state.context.submitErrorMessage,
);

export const getIsCancelled = createStepSelector((state) =>
  state.matches({ initialized: { form: 'cancelled' } }),
);

export const getIsSubmitting = createStepSelector((state) =>
  state.matches({ initialized: { form: 'submitting' } }),
);

export const getIsSubmittingApplication = createStepSelector((state) =>
  state.matches({
    initialized: { form: { submitting: 'submittingApplication' } },
  }),
);

export const getWasSubmittingApplication = createStepSelector((state) =>
  state.history?.matches({
    initialized: { form: { submitting: 'submittingApplication' } },
  }),
);

export const getIsSendingWorkflowResponses = createStepSelector((state) =>
  state.matches({
    initialized: { form: { submitting: 'sendingWorkflowResponses' } },
  }),
);

export const getWasSendingWorkflowResponses = createStepSelector((state) =>
  state.history?.matches({
    initialized: { form: { submitting: 'sendingWorkflowResponses' } },
  }),
);

export const getIsSubmittingFailed = createStepSelector((state) =>
  state.matches({ initialized: { form: 'submittingFailed' } }),
);
