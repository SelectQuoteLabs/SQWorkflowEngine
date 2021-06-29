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
  DataSourceItem,
  StepMachineContext,
  StepMachineEvent,
  StepMachineState,
  StepQuestion,
  StepText,
} from './stepMachineTypes';
import {
  DataSource,
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
import { fetchWrapper } from 'utils/fetchWrapper';

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
      sendWorkflowResponses({ body, applicationKey }),
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
        parentUpdated: false,
        confirmationID: '',
      },
      on: {
        UPDATE_PARENT: {
          actions: ['sendUpdateToParent'],
        },
        RECEIVE_QUESTION_UPDATE: {
          target: '#checkingActionsQueue',
          actions: [
            'setUpdatesFromQuestionToContext',
            'sendKnockoutStateToParent',
          ],
        },
        RECEIVE_VALUE_UPDATE: {
          actions: [
            'updateValues',
            'updateDataSourcesQueue',
            send((context) =>
              context.dataSourcesQueue?.length
                ? { type: 'CHECK_DATA_SOURCES_QUEUE' }
                : { type: '' },
            ),
          ],
        },
      },
      states: {
        initializing: {
          id: 'initializing',
          entry: ['setInitialValues', 'setDataSources', 'initializeChildSteps'],
          always: [{ target: 'initialized' }],
        },
        initialized: {
          id: 'initialized',
          type: 'parallel',
          states: {
            form: {
              id: 'form',
              initial: 'idle',
              states: {
                idle: {
                  id: 'idle',
                  on: {
                    SUBMIT: {
                      target: 'submitting',
                      actions: ['setFormDetailsToContext'],
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
                          target: '#idle',
                          cond: 'isClean',
                          actions: ['sendParentNextStep'],
                        },
                        {
                          target: 'sendingWorkflowResponses',
                          cond: 'hasNewValues',
                        },
                        {
                          target: 'submittingApplication',
                          cond: 'stepCanSubmitApplication',
                        },
                        {
                          target: '#idle',
                          actions: [
                            'sendSummaryToParent',
                            assign<StepMachineContext, StepMachineEvent>({
                              parentUpdated: true,
                            }),
                            'sendParentNextStep',
                          ],
                        },
                      ],
                    },
                    sendingWorkflowResponses: {
                      id: 'sendingWorkflowResponses',
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
                              'sendSummaryToParent',
                              assign<
                                StepMachineContext,
                                DoneInvokeEvent<unknown>
                              >({
                                hasNewValues: false,
                                parentUpdated: true,
                              }),
                              sendParent({
                                type: 'SET_SUCCESS_MESSAGE',
                                message: 'Responses saved successfully',
                              }),
                            ],
                          },
                        ],
                      },
                    },
                    submittingApplication: {
                      id: 'submittingApplication',
                      invoke: {
                        src: 'sendApplicationSubmit',
                        onDone: [
                          {
                            target: '#idle',
                            cond: 'parentNeedsUpdate',
                            actions: [
                              'sendSummaryToParent',
                              assign<
                                StepMachineContext,
                                DoneInvokeEvent<unknown>
                              >({
                                parentUpdated: true,
                              }),
                              'sendParentNextStep',
                              sendParent({
                                type: 'SET_SUCCESS_MESSAGE',
                                message: 'Application submitted successfully',
                              }),
                            ],
                          },
                          { target: '#idle', actions: ['sendParentNextStep'] },
                        ],
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
            dataSources: {
              id: 'dataSources',
              initial: 'initializing',
              states: {
                initializing: {
                  always: [
                    {
                      target: 'checkingDataSourcesQueue',
                      actions: [
                        assign<StepMachineContext, StepMachineEvent>({
                          dataSourcesQueue: (context) => [
                            ...(context.dataSources?.items ?? []),
                          ],
                        }),
                      ],
                    },
                  ],
                },
                idle: {
                  id: 'dataSourcesIdle',
                  on: {
                    CHECK_DATA_SOURCES_QUEUE: {
                      target: 'checkingDataSourcesQueue',
                    },
                  },
                },
                checkingDataSourcesQueue: {
                  always: [
                    {
                      target: 'fetchingDataSource',
                      cond: 'hasDataSourceInQueue',
                    },
                    { target: '#dataSourcesIdle' },
                  ],
                },
                fetchingDataSource: {
                  id: 'fetchingDataSource',
                  entry: [
                    assign({
                      currentDataSource: (context) => {
                        const { dataSourcesQueue } = context;
                        const [dataSourceItem] =
                          dataSourcesQueue as DataSourceItem[];
                        return dataSourceItem as DataSourceItem;
                      },
                    }),
                  ],
                  invoke: {
                    src: 'fetchDataSource',
                    onDone: {
                      target: 'checkingDataSourcesQueue',
                      actions: [
                        send(
                          (context, event) => {
                            const { data } = event;
                            const { currentDataSource } = context;
                            const { labelPropertyName, valuePropertyName } = (
                              currentDataSource as DataSourceItem
                            ).dataSource;
                            const options = data.map(
                              (item: Record<string, string>) => ({
                                value: item[valuePropertyName],
                                label: item[labelPropertyName],
                              }),
                            );
                            return { type: 'UPDATE_OPTIONS', options };
                          },
                          {
                            to: (context) => {
                              const { currentDataSource, childSteps } = context;
                              const { originID } =
                                currentDataSource as DataSourceItem;
                              const { ref, id } =
                                childSteps?.find(
                                  (childStep) => childStep.id === originID,
                                ) ?? {};
                              if (typeof ref === 'undefined') {
                                throw new Error(
                                  `childStep ${id} ref is undefined`,
                                );
                              }
                              return ref;
                            },
                          },
                        ),
                        assign((context, event) => {
                          const { currentDataSource } = context;
                          const { valuePropertyName } = (
                            currentDataSource as DataSourceItem
                          ).dataSource;
                          const questionID =
                            context.childSteps?.find(
                              (childStep): childStep is StepQuestion =>
                                childStep.id ===
                                context.currentDataSource?.originID,
                            )?.questionID ?? '';
                          const optionsValues = event.data.map(
                            (item: Record<string, string>) =>
                              item[valuePropertyName],
                          );
                          return {
                            // removes item from queue
                            dataSourcesQueue:
                              context.dataSourcesQueue?.slice(1),
                            // if the current question value doesn't matche one of the values from the api response set the value to empty
                            values:
                              context.values &&
                              !optionsValues.includes(
                                context.values[questionID],
                              )
                                ? {
                                    ...context.values,
                                    [questionID]: '',
                                  }
                                : context.values,
                          };
                        }),
                      ],
                    },
                  },
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
                          action.actionType ===
                          ActionTypes.UPDATESTEPVISIBILITY,
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
                      ActionTypes.UPDATESTEPISREQUIRED,
                    );
                    const updateStepIsRequiredAction =
                      queuedAction?.actions?.find(
                        (action): action is UpdateStepIsRequiredAction =>
                          action.actionType ===
                          ActionTypes.UPDATESTEPISREQUIRED,
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
          },
        },
      },
    },
    {
      services: {
        /** When the form is submitted we need to send the values to the backend in the appropriate formate */
        async sendWorkflowResponses(context) {
          const { applicationKey, workflowID, stepID, childSteps, values } =
            context;

          if (!applicationKey) {
            throw new Error('Invalid `applicationKey`');
          }

          const questions = childSteps?.filter(
            (childStep): childStep is StepQuestion =>
              childStep.stepType === StepTypes.QUESTION,
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
                  (question) => question.questionID === questionID,
                ) ?? {};

              const responseSource = getResponseSource(
                prePopulatedResponse,
                value,
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
            }),
          );
        },
        fetchDataSource: (context) => {
          const { currentDataSource, values } = context;

          const {
            url: baseUrl,
            queryStringParameters,
            requestMethodType,
          } = (currentDataSource as DataSourceItem).dataSource;

          const url =
            baseUrl +
            queryStringParameters
              .map((item) => {
                const zipCode = (values as Record<string, string>)[
                  item.questionId
                ];
                return `?${item.parameterName}=${zipCode} `;
              })
              .join('');

          return fetchWrapper({ url, method: requestMethodType });
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
        sendSummaryToParent: actions.send((context) => {
          const { stepSummary, stepID } = context;
          return {
            type: 'UPDATE_PARENT',
            payload: { stepSummary, stepID },
          };
        }),
        sendParentNextStep: actions.sendParent((context) => ({
          type: 'GO_TO_STEP',
          stepID: context.nextStepID,
        })),
        updateValues: assign<
          StepMachineContext,
          NarrowEvent<StepMachineEvent, 'RECEIVE_VALUE_UPDATE'>
        >({
          values: (context, event) => ({
            ...context.values,
            [event.questionID]: event.value,
          }),
        }) as any,
        updateDataSourcesQueue: assign<
          StepMachineContext,
          NarrowEvent<StepMachineEvent, 'RECEIVE_VALUE_UPDATE'>
        >({
          dataSourcesQueue: (context, event) => {
            const { dataSources, dataSourcesQueue } = context;
            const { questionID } = event;
            if (dataSources?.dependencies.includes(event.questionID)) {
              const dataSource = dataSources.items.find(
                (item) => item.questionID === questionID,
              );
              if (!dataSource) {
                return dataSourcesQueue;
              }
              return [...(dataSourcesQueue || []), dataSource];
            }
            return dataSourcesQueue;
          },
        }) as any,
        /** Set the `initialValues` for the form within the step based on the step's questions */
        setInitialValues: assign<StepMachineContext, StepMachineEvent>(
          (context) => {
            const { childSteps } = context;
            const questions = childSteps
              ?.filter(
                (childStep): childStep is StepQuestion =>
                  childStep.stepType === StepTypes.QUESTION,
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

            const valuesObject = questions ? Object.fromEntries(questions) : {};
            return {
              initialValues: valuesObject,
              values: valuesObject,
            };
          },
        ),
        setDataSources: assign<StepMachineContext, StepMachineEvent>(
          (context) => {
            const { childSteps } = context;
            const dataSources = childSteps
              ?.filter(
                (childStep): childStep is StepQuestion =>
                  childStep.stepType === StepTypes.QUESTION,
              )
              .reduce(
                (
                  acc: {
                    dependencies: string[];
                    items: {
                      questionID: string;
                      originID: string;
                      dataSource: DataSource;
                    }[];
                  },
                  questionStep,
                ) => {
                  const { dataSource, id } = questionStep;
                  if (!dataSource) {
                    return acc;
                  }
                  const [questionID] = dataSource.queryStringParameters.map(
                    (item) => item.questionId,
                  );
                  if (!questionID) {
                    console.warn('dataSource missing questionID', dataSource);
                    return acc;
                  }
                  const dataSourceItem = {
                    questionID: questionID,
                    originID: id,
                    dataSource,
                  };
                  questionID && acc.dependencies.push(questionID);
                  acc.items.push(dataSourceItem);
                  return acc;
                },
                { dependencies: [], items: [] },
              );

            return {
              dataSources,
            };
          },
        ),
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
                            childStep.prePopulatedResponse?.value,
                          ),
                          onCompleteConditionalActions:
                            childStep.onCompleteConditionalActions,
                          options: childStep.options,
                        }),
                        `question-${childStep.id}`,
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
                        `text-${childStep.id}`,
                      ) as StepText['ref'],
                    };
                  }
                }),
            };
          },
        ),
        /** The 'SUBMIT' event is sent with the form's values and the `stepSummary`, this action assigns those to the machine context */
        setFormDetailsToContext: assign<
          StepMachineContext,
          NarrowEvent<StepMachineEvent, 'SUBMIT'>
        >((context, event) => {
          const hasNewValues =
            !shallowCompare(event.payload.values, context.values) &&
            !shallowCompare(event.payload.values, context.initialValues);
          return {
            values: event.payload.values,
            stepSummary: event.payload.stepSummary,
            hasNewValues,
            parentUpdated: hasNewValues,
            wasSubmitted: true,
          };
        }) as any,
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
                      (action) => action !== actionToRemove,
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
                    childStep.id === updateStepVisibilityAction?.stepId,
                ) ?? {};
              if (typeof ref === 'undefined') {
                throw new Error(`childStep ${id} ref is undefined`);
              }
              return ref;
            },
          },
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
                    childStep.id === updateStepIsRequiredAction?.stepId,
                ) ?? {};
              if (typeof ref === 'undefined') {
                throw new Error(`childStep ${id} ref is undefined`);
              }
              return ref;
            },
          },
        ) as any,
      },
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
        isClean: (context) =>
          Boolean(!context.hasNewValues) &&
          Boolean(!context.hasPassWorkflow) &&
          Boolean(context.parentUpdated),
        hasNewValues: (context) => Boolean(context.hasNewValues),
        stepCanSubmitApplication: (context) =>
          Boolean(context.hasPassWorkflow) && !context.confirmationID,
        isKnockout: (context) => Boolean(context.knockout?.isKnockout),
        parentNeedsUpdate: (context) => Boolean(!context.parentUpdated),
        hasDataSourceInQueue: (context) =>
          Boolean(context.dataSourcesQueue?.length),
      },
    },
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
  value: string,
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
  questionType: QuestionType | undefined,
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
