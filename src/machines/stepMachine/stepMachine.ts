import {
  createMachine,
  assign,
  actions,
  sendParent,
  spawn,
  send,
  StateMachine,
  DoneInvokeEvent,
} from 'xstate';
import { useMutation, useQueryClient } from 'react-query';
import moment from 'moment';

import {
  ActionTypes,
  UpdateStepIsRequiredAction,
  UpdateStepVisibilityAction,
} from 'types/actions';
import { StepTypes } from 'types/steps';
import {
  StepMachineContext,
  StepMachineEvent,
  StepMachineState,
  StepQuestion,
  StepText,
} from './stepMachineTypes';
import { MCEMachineEvent } from 'machines/MCEMachine/MCEMachineTypes';
import {
  PrePopulatedResponse,
  QuestionType,
  QuestionTypes,
  ResponseDataType,
  ResponseDataTypes,
  ResponseSourceType,
  ResponseSourceTypes,
} from 'types/questions';
import { WorkflowResponsesBody } from 'types/workflow';
import { NarrowEvent, shallowCompare } from 'machines/utils';
import { sendApplicationSubmit, sendWorkflowResponses } from 'utils/api';
import questionMachine, {
  findActionInQueue,
  hasActionInQueue,
} from 'machines/questionMachine/questionMachine';
import { textStepMachine } from '../textStepMachine';

interface MutationData {
  applicationKey: string;
  body: WorkflowResponsesBody;
}

const useStepMachine = (): StateMachine<
  StepMachineContext,
  StepMachineState,
  StepMachineEvent,
  StepMachineState
> => {
  const { mutateAsync } = useMutation<unknown, unknown, MutationData>(
    ({ applicationKey, body }) =>
      sendWorkflowResponses({ body, applicationKey })
  );

  const queryClient = useQueryClient();

  const stepMachine = createMachine<
    StepMachineContext,
    StepMachineEvent,
    StepMachineState
  >(
    {
      id: 'step',
      initial: 'initializing',
      context: {
        stepID: '',
        nextStepID: '',
        values: {},
        childSteps: [],
        applicationKey: '',
        workflowID: '',
        wasSubmitted: false,
        confirmationID: '',
      },
      on: {
        UPDATE_PARENT: {
          actions: ['sendUpdateToParent'],
        },
        RECEIVE_QUESTION_UPDATE: {
          target: 'performingActions',
          actions: [
            'setUpdatesFromQuestionToContext',
            'sendKnockoutStateToParent',
          ],
        },
      },
      states: {
        initializing: {
          entry: [
            'setInitialValues',
            'initializeChildSteps',
            actions.send({ type: 'DONE' }),
          ],
          on: {
            DONE: 'idle',
          },
        },
        idle: {
          id: 'idle',
          on: {
            SUBMIT: {
              target: 'submitting',
              actions: ['setFormDetailsToContext'],
            },
          },
        },
        performingActions: {
          id: 'performingActions',
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
              always: [
                {
                  target: 'updatingChildStepVisibility',
                  cond: 'hasUpdateStepVisibilityAction',
                },
                {
                  target: 'updatingChildStepRequired',
                  cond: 'hasUpdateStepRequiredAction',
                },
                { target: '#idle' },
              ],
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
                  ActionTypes.UPDATESTEPVISIBILITY
                );
                const updateStepVisibilityAction = queuedAction?.actions?.find(
                  (action): action is UpdateStepVisibilityAction =>
                    action.actionType === ActionTypes.UPDATESTEPVISIBILITY
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
                    'updateChildStepVisibility',
                    actions.send((_context, event) => ({
                      type: 'REMOVE_ACTION_FROM_QUEUE',
                      actionToRemove: event.updateStepVisibilityAction,
                    })),
                  ],
                },
                REMOVE_ACTION_FROM_QUEUE: {
                  target: 'checkingActionsQueue',
                  actions: ['removeActionFromQueue'],
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
                  ActionTypes.UPDATESTEPISREQUIRED
                );
                const updateStepIsRequiredAction = queuedAction?.actions?.find(
                  (action): action is UpdateStepIsRequiredAction =>
                    action.actionType === ActionTypes.UPDATESTEPISREQUIRED
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
                    'updateChildStepRequired',
                    actions.send((_context, event) => ({
                      type: 'REMOVE_ACTION_FROM_QUEUE',
                      actionToRemove: event.updateStepIsRequiredAction,
                    })),
                  ],
                },
                REMOVE_ACTION_FROM_QUEUE: {
                  target: 'checkingActionsQueue',
                  actions: ['removeActionFromQueue'],
                },
              },
            },
          },
        },
        submitting: {
          id: 'submitting',
          initial: 'checkingSubmittedValues',
          states: {
            checkingSubmittedValues: {
              always: [
                {
                  target: 'sendingWorkflowResponses',
                  cond: 'hasNewValues',
                },
                {
                  target: 'submittingApplication',
                  cond: 'stepCanSubmitApplication',
                },
                {
                  target: 'updatingParent',
                },
              ],
            },
            sendingWorkflowResponses: {
              invoke: {
                src: 'sendWorkflowResponses',
                onDone: [
                  {
                    target: '#cancelled',
                    cond: 'isKnockout',
                  },
                  {
                    target: 'checkingSubmittedValues',
                    actions: [
                      assign<StepMachineContext, DoneInvokeEvent<unknown>>({
                        hasNewValues: false,
                      }),
                      sendParent({
                        type: 'SET_SUCCESS_MESSAGE',
                        message: 'Responses saved successfully',
                      }),
                    ],
                  },
                ],
                onError: {
                  target: '#idle',
                  actions: [
                    sendParent<
                      StepMachineContext,
                      DoneInvokeEvent<Error>,
                      MCEMachineEvent
                    >((_context, event) => {
                      return {
                        type: 'SET_ERROR',
                        error: {
                          errorData: event.data,
                          message: event.data.message,
                        },
                      };
                    }),
                  ],
                },
              },
            },
            submittingApplication: {
              invoke: {
                src: 'sendApplicationSubmit',
                onDone: {
                  target: 'updatingParent',
                },
                onError: {
                  target: '#idle',
                  actions: [
                    sendParent<
                      StepMachineContext,
                      DoneInvokeEvent<Error>,
                      MCEMachineEvent
                    >((_context, event) => {
                      return {
                        type: 'SET_ERROR',
                        error: {
                          errorData: event.data,
                          message: event.data.message,
                        },
                      };
                    }),
                  ],
                },
              },
            },
            /**
             * If the responses are successfully sent to the backend update the parent with the `stepSummary` and send the 'GO_TO_STEP' event
             * to the parent machine
             */
            updatingParent: {
              entry: [
                actions.send((context) => {
                  const { stepSummary, stepID } = context;
                  return {
                    type: 'UPDATE_PARENT',
                    payload: { stepSummary, stepID },
                  };
                }),
                actions.sendParent((context) => ({
                  type: 'GO_TO_STEP',
                  stepID: context.nextStepID,
                })),
                actions.send('DONE'),
              ],
              on: {
                DONE: {
                  target: '#idle',
                },
              },
            },
          },
        },
        cancelled: {
          id: 'cancelled',
          type: 'final',
        },
      },
    },
    {
      services: {
        /** When the form is submitted we need to send the values to the backend in the appropriate formate */
        async sendWorkflowResponses(context) {
          const {
            applicationKey,
            workflowID,
            stepID,
            childSteps,
            values,
          } = context;

          if (!applicationKey) {
            throw new Error('Invalid `applicationKey`');
          }

          const questions = childSteps?.filter(
            (childStep): childStep is StepQuestion =>
              childStep.stepType === StepTypes.QUESTION
          );

          // TODO: figure out the appropriate type states to make these checks unnecessary
          if (!questions) {
            throw new Error('There are no questions in this step');
          }
          if (!values) {
            throw new Error('The values for this step have not been set');
          }

          /**
           * The workflow responses endpoint expects the reponses to be in a certain shape. Here we are taking the values and putting them
           * in the expected shape with all of the necessary data.
           */
          const questionStepResponses = Object.entries(values)
            // TODO: remove filter when null values allowed in response
            .filter((value) => !value.includes(''))
            .map(([questionID, value]) => {
              const { prePopulatedResponse, questionType } =
                questions.find(
                  (question) => question.questionID === questionID
                ) ?? {};

              const responseSource = getResponseSource(
                prePopulatedResponse,
                value
              );
              const dataType = getDataType(questionType);

              return {
                stepId: stepID,
                questionId: questionID,
                dataType,
                responseDate: moment.utc(),
                responseValue: value,
                responseSource,
              };
            });

          const response = await mutateAsync({
            applicationKey: applicationKey,
            body: {
              workflowId: workflowID,
              questionStepResponses,
            },
          });
          return response;
        },
        /** When the form reaches a step with the passWorkflow action we need to send the applicationKey for submission */
        async sendApplicationSubmit(context) {
          const { applicationKey } = context;

          if (!applicationKey) {
            throw new Error('Invalid `applicationKey`');
          }

          return queryClient.fetchQuery(['submitData'], () =>
            sendApplicationSubmit({
              applicationKey,
            })
          );
        },
      },
      actions: {
        /** Send data to parent MCEMachine */
        sendUpdateToParent: sendParent<
          StepMachineContext,
          NarrowEvent<StepMachineEvent, 'UPDATE_PARENT'>
        >((_context, event) => {
          return {
            type: 'RECEIVE_UPDATE_FROM_CHILD',
            payload: event.payload,
          };
        }) as any,
        /** Set the `initialValues` for the form within the step based on the step's questions */
        setInitialValues: assign<StepMachineContext, StepMachineEvent>({
          initialValues: (context) => {
            const { childSteps } = context;
            const questions = childSteps
              ?.filter(
                (childStep): childStep is StepQuestion =>
                  childStep.stepType === StepTypes.QUESTION
              )
              .map((question) => {
                const getValue = (value?: string | boolean): string => {
                  if (typeof value === 'boolean') {
                    return value ? 'yes' : 'no';
                  } else if (!value) {
                    return '';
                  } else {
                    return value;
                  }
                };
                // Parses the question's `prePopulatedResponse` value, if it exists, to determine what the initial value should be
                const value = getValue(question.prePopulatedResponse?.value);
                return [question.questionID, value];
              });

            return questions ? Object.fromEntries(questions) : {};
          },
        }),
        /** Spawns all of the question and text subSteps, each with the initial context that they need */
        initializeChildSteps: assign<StepMachineContext, StepMachineEvent>(
          (context) => {
            const { childSteps } = context;
            return {
              childSteps:
                childSteps &&
                childSteps.map((childStep) => {
                  if (childStep.stepType === StepTypes.QUESTION) {
                    return {
                      ...childStep,
                      ref: spawn(
                        questionMachine.withContext({
                          id: childStep.id,
                          questionID: childStep.questionID,
                          initialVisibility: childStep.isVisible,
                          initialRequired: childStep.isRequired,
                          initialValue: getValue(
                            childStep.prePopulatedResponse?.value
                          ),
                          onCompleteConditionalActions:
                            childStep.onCompleteConditionalActions,
                        }),
                        `question-${childStep.id}`
                      ) as StepQuestion['ref'],
                    };
                  } else {
                    return {
                      ...childStep,
                      ref: spawn(
                        textStepMachine.withContext({
                          id: childStep.id,
                          initialVisibility: childStep.isVisible,
                        }),
                        `text-${childStep.id}`
                      ) as StepText['ref'],
                    };
                  }
                }),
            };
          }
        ),
        /** The 'SUBMIT' event is sent with the form's values and the `stepSummary`, this action assigns those to the machine context */
        setFormDetailsToContext: assign<
          StepMachineContext,
          NarrowEvent<StepMachineEvent, 'SUBMIT'>
        >((context, event) => ({
          values: event.payload.values,
          stepSummary: event.payload.stepSummary,
          hasNewValues:
            !shallowCompare(event.payload.values, context.values) &&
            !shallowCompare(event.payload.values, context.initialValues),
          wasSubmitted: true,
        })) as any,
        /**
         * When a question is changed the questionMachine will send an update to the it's parent stepMachine with any actions it needs to perform
         * and the knockout state that may have changed based on the question's value.
         */
        setUpdatesFromQuestionToContext: assign<
          StepMachineContext,
          NarrowEvent<StepMachineEvent, 'RECEIVE_QUESTION_UPDATE'>
        >((context, event) => {
          const { questionActionsQueue } = context;
          const { actionsQueue, isKnockout, questionID } = event.payload;
          const updatedQueue = [
            ...(questionActionsQueue || []),
            ...actionsQueue,
          ];

          return {
            questionActionsQueue: updatedQueue,
            knockout: { isKnockout, questionID },
          };
        }) as any,
        /**
         * Send the current knockout state to the MCEMachine. This allows the side nav bar, footer bar, and question components to react to the
         * knockout state via `useMCEService`
         */
        sendKnockoutStateToParent: send((context) => {
          const { knockout } = context;
          return {
            type: 'UPDATE_PARENT',
            payload: { knockout },
          };
        }),
        /** Creates an updated queue with the `actionToRemove` removed and assigns it to `questionActionsQueue` */
        removeActionFromQueue: assign<
          StepMachineContext,
          NarrowEvent<StepMachineEvent, 'REMOVE_ACTION_FROM_QUEUE'>
        >((context, event) => {
          const { questionActionsQueue } = context;
          const { actionToRemove } = event;

          const updatedQueue = questionActionsQueue
            ?.map((questionAction) => {
              return questionAction.actions.includes(actionToRemove)
                ? {
                    ...questionAction,
                    actions: questionAction.actions.filter(
                      (action) => action !== actionToRemove
                    ),
                  }
                : questionAction;
            })
            /**
             * An empty array is left behind when the last conditional action from a question has been performed. This filter removes that empty
             * array from the updated queue.
             */
            .filter((questionAction) => Boolean(questionAction.actions.length));

          return {
            questionActionsQueue: updatedQueue,
          };
        }) as any,
        /**
         * With the action and evaluation result from the event, this action determines which event to send to which child question/text machine.
         * https://xstate.js.org/docs/guides/actors.html#sending-events-to-actors
         */
        updateChildStepVisibility: actions.send<
          StepMachineContext,
          NarrowEvent<StepMachineEvent, 'UPDATE_CHILD_STEP_VISIBILITY'>
        >(
          (_context, event) => {
            const { updateStepVisibilityAction, evaluationResult } = event;
            if (typeof updateStepVisibilityAction === 'undefined') {
              throw new Error('updateStepVisibilityAction not found');
            }
            /**
             * If the `evaluationResult` and the action's `isVisible` property is true we want set the event `type` to 'SHOW' to tell the child
             * step to become visible. Otherwise, set it to 'HIDE' to tell the child step it should not be visible.
             */
            return {
              type:
                evaluationResult && updateStepVisibilityAction.isVisible
                  ? 'SHOW'
                  : 'HIDE',
            };
          },
          {
            to: (context, event) => {
              /**
               * Here we are getting the `ref` of the child step whose `id` matches the `stepId` of the action. This determines which child machine
               * to send the event to.
               */
              const { childSteps } = context;
              const { updateStepVisibilityAction } = event;
              const { ref, id } =
                childSteps?.find(
                  (childStep) =>
                    childStep.id === updateStepVisibilityAction?.stepId
                ) ?? {};
              if (typeof ref === 'undefined') {
                throw new Error(`childStep ${id} ref is undefined`);
              }
              return ref;
            },
          }
        ) as any,
        /** This action is almost exactly the same as `updateChildStepVisibility` */
        updateChildStepRequired: actions.send<
          StepMachineContext,
          NarrowEvent<StepMachineEvent, 'UPDATE_CHILD_STEP_REQUIRED'>
        >(
          (_context, event) => {
            const { updateStepIsRequiredAction, evaluationResult } = event;
            if (typeof updateStepIsRequiredAction === 'undefined') {
              throw new Error('updateStepRequiredAction not found');
            }

            let type: string;
            if (
              (evaluationResult && updateStepIsRequiredAction.isRequired) ||
              (!evaluationResult && !updateStepIsRequiredAction.isRequired)
            ) {
              type = 'REQUIRED';
            } else {
              type = 'NOT_REQUIRED';
            }
            return {
              type,
            };
          },
          {
            to: (context, event) => {
              const { childSteps } = context;
              const { updateStepIsRequiredAction } = event;
              const { ref, id } =
                childSteps?.find(
                  (childStep) =>
                    childStep.id === updateStepIsRequiredAction?.stepId
                ) ?? {};
              if (typeof ref === 'undefined') {
                throw new Error(`childStep ${id} ref is undefined`);
              }
              return ref;
            },
          }
        ) as any,
      },
      guards: {
        /** Checks if the queue contains an `updateStepVisibility` action */
        hasUpdateStepVisibilityAction: (context) => {
          return context.questionActionsQueue
            ? hasActionInQueue(
                context.questionActionsQueue,
                ActionTypes.UPDATESTEPVISIBILITY
              )
            : false;
        },
        /** Checks if the queue contains an `updateStepIsRequired` action */
        hasUpdateStepRequiredAction: (context) => {
          return context.questionActionsQueue
            ? hasActionInQueue(
                context.questionActionsQueue,
                ActionTypes.UPDATESTEPISREQUIRED
              )
            : false;
        },
        hasNewValues: (context) => Boolean(context.hasNewValues),
        stepCanSubmitApplication: (context) =>
          Boolean(context.hasPassWorkflow) && !context.confirmationID,
        isKnockout: (context) => Boolean(context.knockout?.isKnockout),
      },
    }
  );

  return stepMachine;
};

export default useStepMachine;

/**
 * The responses will come from the agent, api, or teneo. If the agent entered the answer into the input we want to return that response source.
 * Otherwise we can assume that the response was pre-populated by either the api or teneo, so we can pass along the response source that was in
 * the question's prePopulatedResponse object.
 */
const getResponseSource = (
  prePopulatedResponse: PrePopulatedResponse | undefined,
  value: string
): ResponseSourceType => {
  if (!prePopulatedResponse) {
    return ResponseSourceTypes.AGENT;
  }

  const getPrePopulatedResponseValue = (): string => {
    if (prePopulatedResponse.responseType === 'boolean') {
      return prePopulatedResponse.responseType ? 'yes' : 'no';
    } else {
      return prePopulatedResponse.value as string;
    }
  };
  const prePopulatedResponseValue = getPrePopulatedResponseValue();

  if (value === prePopulatedResponseValue) {
    return prePopulatedResponse.responseSourceType;
  } else {
    return ResponseSourceTypes.AGENT;
  }
};

/** Returns the response data type based on the question type */
const getDataType = (
  questionType: QuestionType | undefined
): ResponseDataType => {
  if (questionType === QuestionTypes.BOOLEAN) {
    return ResponseDataTypes.BOOLEAN;
  } else if (questionType === QuestionTypes.DATE) {
    return ResponseDataTypes.DATE;
  } else {
    return ResponseDataTypes.STRING;
  }
};

const getValue = (value?: string | boolean): string => {
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  } else if (!value) {
    return '';
  } else {
    return value;
  }
};
