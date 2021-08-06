import { actions, assign } from 'xstate';
import { createModel } from 'xstate/lib/model';
import { Moment } from 'moment';

import { ActionTypes } from 'types/actions';
import {
  createSelector,
  createSelectorHook,
  ExtractModelEvent,
  hasActionInQueue,
} from 'machines/utils';
import { ConditionalActions } from 'types/evaluations';
import { ActionsQueueItem } from './question.types';
import { DataSource, MultipleChoiceOptionValue } from 'types/questions';
import { fetchWrapper } from 'utils/fetchWrapper';
import { questionActions } from './question.actions';

export const questionModel = createModel(
  {
    id: '',
    questionID: '',
    initialVisibility: false,
    initialRequired: false,
    onCompleteConditionalActions: [] as ConditionalActions[] | null,
    initialValue: '',
    value: '' as string | Moment,
    actionsQueue: [] as ActionsQueueItem[],
    isKnockout: false,
    knockoutMessage: null as string | null,
    dataSource: null as DataSource | null,
    options: null as MultipleChoiceOptionValue[] | null,
    dataSourceDepValue: '',
  },
  {
    events: {
      REQUIRED: () => ({}),
      NOT_REQUIRED: () => ({}),
      SHOW: () => ({}),
      HIDE: () => ({}),
      EVALUATE_COMPARISON: () => ({}),
      PARSE_CONDITIONAL_ACTIONS: () => ({}),
      FETCH_DATA_SOURCE: (value: string) => ({ value }),
      SYNC_PARENT_WITH_CURRENT_VALUE: () => ({}),
      UPDATE_PARENT_WITH_VALUE: () => ({}),
      UPDATE_VALUE: (value: string | Moment) => ({ value }),
    },
  },
);

const questionMachine = questionModel.createMachine(
  {
    id: 'question',
    initial: 'initializing',
    context: questionModel.initialContext,
    states: {
      initializing: {
        id: 'initializing',
        /** In the `initializing` state we need to determine what states the parallel `visibility` and `require` states should initially be in. */
        always: [
          {
            target: [
              'initialized.visibility.visible',
              'initialized.require.required',
            ],
            cond: 'initiallyVisibleAndRequired',
          },
          {
            target: [
              'initialized.visibility.visible',
              'initialized.require.notRequired',
            ],
            cond: 'initiallyVisibleAndNotRequired',
          },
          {
            target: [
              'initialized.visibility.invisible',
              'initialized.require.required',
            ],
            cond: 'initiallyNotVisibleAndRequired',
          },
          {
            target: [
              'initialized.visibility.invisible',
              'initialized.require.notRequired',
            ],
            cond: 'initiallyNotVisibleAndNotRequired',
          },
        ],
      },
      initialized: {
        id: 'initialized',
        // https://xstate.js.org/docs/guides/parallel.html#parallel-state-nodes
        type: 'parallel',
        states: {
          visibility: {
            id: 'visibility',
            states: {
              visible: {
                id: 'visible',
                initial: 'checkingInitialValues',
                on: {
                  HIDE: {
                    target: 'invisible',
                  },
                },
                states: {
                  checkingInitialValues: {
                    always: [
                      {
                        target: 'evaluatingConditionalActions',
                        cond: 'isUntouchedWithInitialValue',
                        actions: [
                          assign({
                            value: (context) => context.initialValue,
                          }),
                        ],
                      },
                      { target: 'idle' },
                    ],
                  },
                  idle: {
                    id: 'idle',
                    on: {
                      UPDATE_VALUE: {
                        actions: [questionActions.updateValue],
                      },
                      UPDATE_PARENT_WITH_VALUE: {
                        actions: [questionActions.updateParentWithValue],
                      },
                      SYNC_PARENT_WITH_CURRENT_VALUE: {
                        actions: [questionActions.syncParentWithCurrentValue],
                      },
                      PARSE_CONDITIONAL_ACTIONS: {
                        target: 'evaluatingConditionalActions',
                      },
                    },
                  },
                  evaluatingConditionalActions: {
                    id: 'evaluatingConditionalActions',
                    entry: [actions.send('EVALUATE_COMPARISON')],
                    on: {
                      EVALUATE_COMPARISON: {
                        target: 'performingActions',
                        actions: [questionActions.setActionsQueue],
                      },
                    },
                  },
                  performingActions: {
                    id: 'performingActions',
                    initial: 'checkingActionsQueue',
                    onDone: 'idle',
                    states: {
                      checkingActionsQueue: {
                        /**
                         * We want to first check if an action in the queue should trigger a knockout state, if it does we want to
                         * set that state to context then update the parent with that info. Otherwise, if there's no fail action in the
                         * queue but there are other actions still in the queue we want to send those actions to the parent. Then if there are no
                         * actions in the queue at all, just transition back to the `idle` state.
                         */
                        always: [
                          {
                            target: 'settingKnockout',
                            cond: 'hasFailAction',
                          },
                          {
                            target: 'updatingParent',
                            cond: 'hasActionsInQueue',
                          },
                          { target: '#idle' },
                        ],
                      },
                      settingKnockout: {
                        id: 'settingKnockout',
                        always: [
                          {
                            target: 'updatingParent',
                            actions: [questionActions.setKnockoutState],
                          },
                        ],
                      },
                      updatingParent: {
                        id: 'updatingParentStep',
                        always: [
                          {
                            target: 'complete',
                            actions: [questionActions.updateParentStep],
                          },
                        ],
                      },
                      complete: {
                        type: 'final',
                      },
                    },
                  },
                },
              },
              invisible: {
                id: 'invisible',
                on: {
                  SHOW: {
                    target: 'visible',
                  },
                },
              },
            },
          },
          require: {
            id: 'require',
            states: {
              required: {
                id: 'required',
                on: {
                  NOT_REQUIRED: {
                    target: 'notRequired',
                  },
                },
              },
              notRequired: {
                id: 'notRequired',
                on: {
                  REQUIRED: {
                    target: 'required',
                  },
                },
              },
            },
          },
          dataSource: {
            id: 'dataSource',
            initial: 'idle',
            states: {
              idle: {
                on: {
                  FETCH_DATA_SOURCE: [
                    {
                      target: 'fetchingDataSource',
                      cond: 'isNewDepValue',
                      actions: [questionActions.setDepValue],
                    },
                    { target: 'idle' },
                  ],
                },
              },
              fetchingDataSource: {
                id: 'fetchingDataSource',
                invoke: {
                  src: 'fetchDataSource',
                  onDone: {
                    target: 'idle',
                    actions: [
                      questionActions.assignNewOptions,
                      questionActions.updateParentWithResetValue,
                    ],
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
      fetchDataSource: (context) => {
        const { dataSource, dataSourceDepValue } = context;
        const {
          url: baseUrl,
          queryStringParameters,
          requestMethodType,
        } = dataSource as DataSource;

        const url =
          baseUrl +
          queryStringParameters
            .map((item) => {
              return `?${item.parameterName}=${dataSourceDepValue} `;
            })
            .join('');

        return fetchWrapper({ url, method: requestMethodType });
      },
    },
    guards: {
      initiallyVisibleAndRequired: (context) =>
        context.initialVisibility && context.initialRequired,
      initiallyVisibleAndNotRequired: (context) =>
        context.initialVisibility && !context.initialRequired,
      initiallyNotVisibleAndRequired: (context) =>
        !context.initialVisibility && context.initialRequired,
      initiallyNotVisibleAndNotRequired: (context) =>
        !context.initialVisibility && !context.initialRequired,
      isUntouchedWithInitialValue: (context) =>
        !context.value &&
        Boolean(context.initialValue) &&
        Boolean(context.onCompleteConditionalActions),
      /** Checks if a `failWorkflow` action is in the queue */
      hasFailAction: (context) =>
        context.actionsQueue
          ? hasActionInQueue(context.actionsQueue, ActionTypes.FAILWORKFLOW)
          : false,
      /** Checks if there are any actions in the queue */
      hasActionsInQueue: (context) => Boolean(context.actionsQueue?.length),
      isNewDepValue: (context, event): boolean =>
        (event as ExtractModelEvent<typeof questionModel, 'FETCH_DATA_SOURCE'>)
          .value !== context.dataSourceDepValue,
    },
  },
);

export default questionMachine;

export const useQuestionSelector = createSelectorHook<
  typeof questionModel,
  typeof questionMachine
>();

const createQuestionSelector = createSelector<typeof questionMachine>();

export const getKnockoutMessage = createQuestionSelector(
  (state) => state.context.knockoutMessage,
);

export const getValue = createQuestionSelector((state) => state.context.value);

export const getInitialValue = createQuestionSelector(
  (state) => state.context.initialValue,
);

export const getOptions = createQuestionSelector(
  (state) => state.context.options,
);

export const getQuestionID = createQuestionSelector(
  (state) => state.context.questionID,
);

export const getIsVisible = createQuestionSelector((state) =>
  state.matches({
    initialized: { visibility: 'visible' },
  }),
);

export const getIsRequired = createQuestionSelector((state) =>
  state.matches({
    initialized: { require: 'required' },
  }),
);
