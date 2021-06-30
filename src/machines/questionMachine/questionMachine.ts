import { actions, assign, createMachine, sendParent } from 'xstate';
import { Moment } from 'moment';

import {
  Action,
  ActionType,
  ActionTypes,
  FailWorkflowAction,
} from 'types/actions';
import { Comparison, ComparisonType } from 'types/comparisons';
import { EvaluationTypes } from 'types/evaluations';
import {
  QuestionMachineContext,
  QuestionMachineEvent,
  QuestionMachineState,
  ActionsQueueItem,
} from './questionMachineTypes';
import { NarrowEvent } from 'machines/utils';

const questionMachine = createMachine<
  QuestionMachineContext,
  QuestionMachineEvent,
  QuestionMachineState
>(
  {
    id: 'question',
    initial: 'initializing',
    context: {
      id: '',
      questionID: '',
      initialVisibility: true,
      initialRequired: true,
      onCompleteConditionalActions: null,
      actionsQueue: [],
      initialValue: '',
      value: '',
      options: null,
    },
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
                          assign({ value: (context) => context.initialValue }),
                        ],
                      },
                      { target: 'idle' },
                    ],
                  },
                  idle: {
                    id: 'idle',
                    on: {
                      UPDATE_VALUE: {
                        actions: ['updateValue'],
                      },
                      UPDATE_PARENT_WITH_VALUE: {
                        actions: ['updateParentWithValue'],
                      },
                      PARSE_CONDITIONAL_ACTIONS: {
                        target: 'evaluatingConditionalActions',
                      },
                      UPDATE_OPTIONS: {
                        actions: [
                          assign({
                            options: (_context, event) => event.options,
                          }),
                        ],
                      },
                    },
                  },
                  evaluatingConditionalActions: {
                    id: 'evaluatingConditionalActions',
                    entry: [actions.send('EVALUATE_COMPARISON')],
                    on: {
                      EVALUATE_COMPARISON: {
                        target: 'performingActions',
                        actions: ['setActionsQueue'],
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
                          { target: 'settingKnockout', cond: 'hasFailAction' },
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
                            actions: ['setKnockoutState'],
                          },
                        ],
                      },
                      updatingParent: {
                        id: 'updatingParentStep',
                        always: [
                          { target: 'complete', actions: ['updateParentStep'] },
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
        },
      },
    },
  },
  {
    actions: {
      /** Assigns the `value` from the event to the `value` in context */
      updateValue: assign<
        QuestionMachineContext,
        NarrowEvent<QuestionMachineEvent, 'UPDATE_VALUE'>
      >({
        value: (_context, event) => {
          return event.value;
        },
      }) as any,
      updateParentWithValue: sendParent((context) => ({
        type: 'RECEIVE_VALUE_UPDATE',
        questionID: context.questionID,
        value: context.value ? String(context.value) : '',
      })),
      /**
       * Here we're taking the `onCompleteConditionalActions` and determining what the actions should do based on the evaluation of the question's
       * value. To the `actionsQueue` it assigns the evaluation result and the conditional actions that should be performed based on that evaluation.
       */
      setActionsQueue: assign({
        actionsQueue: (context) => {
          const { value, onCompleteConditionalActions } = context;
          return onCompleteConditionalActions?.reduce(
            (
              acc: { evaluationResult: boolean; actions: Action[] }[],
              conditionalAction,
            ) => {
              const { evaluation, actions } = conditionalAction;
              if (evaluation.evaluationType === EvaluationTypes.GROUP) {
                /** If it's a group evaluation we need to check all of the evalations in the group based on the `logicalOperator` */
                const { evaluations: evaluationsArray, logicalOperator } =
                  evaluation;
                /** Evaluate all comparison based on the `value` */
                const allEvaluatedComparisons = evaluationsArray.reduce(
                  (acc, evaluation) => {
                    const hasPassedEvaluation = value
                      ? evaluateComparison(value, evaluation.comparison)
                      : false;
                    acc.push(hasPassedEvaluation);
                    return acc;
                  },
                  [] as boolean[],
                );
                /** Determine if all evaluations have passed based on the `logicalOperator` */
                const hasPassedEvaluations = evaluationOperatorMap[
                  logicalOperator
                ](allEvaluatedComparisons);

                acc.push({
                  evaluationResult: hasPassedEvaluations,
                  actions,
                });
              } else if (
                evaluation.evaluationType === EvaluationTypes.QUESTION
              ) {
                /**
                 * If it's a single question that's being evaluated we just need to determine the evaluation result and pass along the conditional
                 * actions.
                 */
                const hasPassedEvaluations = value
                  ? evaluateComparison(value, evaluation.comparison)
                  : false;

                acc.push({
                  evaluationResult: hasPassedEvaluations,
                  actions,
                });
              }
              return acc;
            },
            [],
          );
        },
      }),
      /**
       * When a question has a `failWorkflow` action we want to store the details of that to context. We store an `isKnockout` boolean, the knockout
       * message from the `failWorkflow` action, and the updated `actionsQueue` with the `failWorkflow` action removed.
       */
      setKnockoutState: assign((context) => {
        const actionInQueue = findActionInQueue(
          context.actionsQueue,
          ActionTypes.FAILWORKFLOW,
        ) as ActionsQueueItem;
        const { actions, evaluationResult } = actionInQueue;
        const failAction = actions.find(
          (action): action is FailWorkflowAction =>
            action.actionType === ActionTypes.FAILWORKFLOW,
        );
        const message = evaluationResult ? failAction?.displayText : null;
        const updatedQueue = context.actionsQueue?.filter(
          (item) => item !== actionInQueue,
        );
        return {
          isKnockout: evaluationResult,
          knockoutMessage: message,
          actionsQueue: updatedQueue,
        };
      }),
      /** Updates the parent stepMachine with the actions it needs to perform, the current knockout state, and the question's ID */
      updateParentStep: sendParent((context) => {
        const { actionsQueue, isKnockout, questionID } = context;
        return {
          type: 'RECEIVE_QUESTION_UPDATE',
          payload: { actionsQueue, isKnockout, questionID },
        };
      }),
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
    },
  },
);

export default questionMachine;

/** First item in the queue that contains an action that matches the given `actionType` */
export const findActionInQueue = (
  queue: ActionsQueueItem[] | undefined,
  actionType: ActionType,
): ActionsQueueItem | undefined => {
  return queue
    ? queue.find(({ actions }) =>
        actions.some((action) => action.actionType === actionType),
      )
    : undefined;
};
/** Returns `true` if the queue contains an item with an action that matches the given `actionType` */
export const hasActionInQueue = (
  queue: ActionsQueueItem[],
  actionType: ActionType,
): boolean => {
  return queue.some((item) =>
    item.actions.find((action) => action.actionType === actionType),
  );
};
/**
 * Determines if the `inputValue` has "passed" based on the `comparisonData`. Returns `true` if the `inputValue` matches what the `comparisonData`
 * is checking for.
 */
const evaluateComparison = (
  inputValue: string | Moment,
  comparisonData: Comparison,
): boolean => {
  const { comparisonType, comparisonValue, comparisonOperator } =
    comparisonData;

  // Get the value from the map based on the comparisonType
  const value = getValueFromComparisonType(inputValue, comparisonType);
  // Evaluate the comparison based on the comparisonOperator and the value
  const evaluatedComparison = comparisonOperatorMap[comparisonOperator]<
    typeof value
  >(value, comparisonValue);

  return evaluatedComparison;
};

const getValueFromComparisonType = (
  inputValue: string | Moment,
  comparisonType: ComparisonType,
): string | boolean | Moment => {
  const comparisonTypeMap = {
    boolean:
      inputValue === 'yes' || (inputValue === 'no' && booleanMap[inputValue]),
    string: inputValue,
    date: inputValue,
    // TODO: figure out what `medicareEligibility` comparison type is
    // medicareEligibility: inputValue,
  };

  return comparisonTypeMap[comparisonType];
};

const booleanMap = {
  yes: true,
  no: false,
};

const comparisonOperatorMap = {
  equals: function <Type>(value: Type, comparisonValue: Type): boolean {
    return value === comparisonValue;
  },
  notEquals: function <Type>(value: Type, comparisonValue: Type): boolean {
    return value !== comparisonValue;
  },
  greaterThan: function <Type>(value: Type, comparisonValue: Type): boolean {
    return value > comparisonValue;
  },
  greaterThanOrEqual: function <Type>(
    value: Type,
    comparisonValue: Type,
  ): boolean {
    return value >= comparisonValue;
  },
  lesserThan: function <Type>(value: Type, comparisonValue: Type): boolean {
    return value < comparisonValue;
  },
  lesserThanOrEqual: function <Type>(
    value: Type,
    comparisonValue: Type,
  ): boolean {
    return value <= comparisonValue;
  },
  // TODO: figure out exactly what `contains` is supposed to do
  // contains: function (
  //   value: unknown[],
  //   comparisonValue: ComparisonType
  // ): boolean {
  //   return value.includes(comparisonValue);
  // },
  hasValue: function <Type>(value: Type): boolean {
    return Boolean(value);
  },
};

const evaluationOperatorMap = {
  or: (evaluatedComparisonsArray: boolean[]): boolean =>
    evaluatedComparisonsArray.includes(true),
  and: (evaluatedComparisonsArray: boolean[]): boolean =>
    evaluatedComparisonsArray.every((value) => value === true),
};
