import { actions, ContextFrom, DoneInvokeEvent, EventFrom } from 'xstate';
import { Moment } from 'moment';

import { ExtractModelEvent, findActionInQueue } from 'machines/utils';
import { Action, ActionTypes, FailWorkflowAction } from 'types/actions';
import { EvaluationTypes } from 'types/evaluations';
import { Comparison, ComparisonType } from 'types/comparisons';
import { ActionsQueueItem } from './question.types';
import { FipsCode } from 'types/dataSource';
import { stepModel } from 'machines/step/step.machine';
import { questionModel } from './question.machine';

/** Assigns the `value` from the event to the `value` in context */
const updateValue = actions.assign<
  ContextFrom<typeof questionModel>,
  ExtractModelEvent<typeof questionModel, 'UPDATE_VALUE'>
>({
  value: (_context, event) => {
    return event.value;
  },
});

const updateParentWithValue = actions.sendParent<
  ContextFrom<typeof questionModel>,
  ExtractModelEvent<typeof questionModel, 'UPDATE_PARENT_WITH_VALUE'>,
  ExtractModelEvent<typeof stepModel, 'RECEIVE_VALUE_UPDATE'>
>((context) => ({
  type: 'RECEIVE_VALUE_UPDATE',
  questionID: context.questionID,
  value: context.value ? String(context.value) : '',
}));

const syncParentWithCurrentValue = actions.sendParent<
  ContextFrom<typeof questionModel>,
  ExtractModelEvent<typeof questionModel, 'SYNC_PARENT_WITH_CURRENT_VALUE'>,
  ExtractModelEvent<typeof stepModel, 'RECEIVE_SYNC_UPDATE'>
>((context) => ({
  type: 'RECEIVE_SYNC_UPDATE',
  questionID: context.questionID,
  value: context.value ? String(context.value) : context.initialValue,
}));

const setDepValue = actions.assign<
  ContextFrom<typeof questionModel>,
  ExtractModelEvent<typeof questionModel, 'FETCH_DATA_SOURCE'>
>({
  dataSourceDepValue: (_context, event) => event.value,
});

/**
 * Here we're taking the `onCompleteConditionalActions` and determining what the actions should do based on the evaluation of the question's
 * value. To the `actionsQueue` it assigns the evaluation result and the conditional actions that should be performed based on that evaluation.
 */
const setActionsQueue = actions.assign<
  ContextFrom<typeof questionModel>,
  ExtractModelEvent<typeof questionModel, 'EVALUATE_COMPARISON'>
>({
  actionsQueue: (context) => {
    const { value, onCompleteConditionalActions } = context;
    return (
      onCompleteConditionalActions?.reduce(
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
            const hasPassedEvaluations = evaluationOperatorMap[logicalOperator](
              allEvaluatedComparisons,
            );

            acc.push({
              evaluationResult: hasPassedEvaluations,
              actions,
            });
          } else if (evaluation.evaluationType === EvaluationTypes.QUESTION) {
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
      ) ?? []
    );
  },
});

/**
 * When a question has a `failWorkflow` action we want to store the details of that to context. We store an `isKnockout` boolean, the knockout
 * message from the `failWorkflow` action, and the updated `actionsQueue` with the `failWorkflow` action removed.
 */
const setKnockoutState = actions.assign<
  ContextFrom<typeof questionModel>,
  EventFrom<typeof questionModel>
>((context) => {
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
});

/** Updates the parent stepMachine with the actions it needs to perform, the current knockout state, and the question's ID */
const updateParentStep = actions.sendParent<
  ContextFrom<typeof questionModel>,
  EventFrom<typeof questionModel>,
  ExtractModelEvent<typeof stepModel, 'RECEIVE_QUESTION_UPDATE'>
>((context) => {
  const { actionsQueue, isKnockout, questionID } = context;
  return {
    type: 'RECEIVE_QUESTION_UPDATE',
    payload: { actionsQueue, isKnockout, questionID },
  };
});

const assignNewOptions = actions.assign<
  ContextFrom<typeof questionModel>,
  DoneInvokeEvent<FipsCode[]>
>({
  options: (context, event) => {
    const { dataSource } = context;
    if (!dataSource) {
      throw new Error('dataSource is undefined in fetchDataSource');
    }
    return event.data.length
      ? event.data.map((item) => ({
          value: item[dataSource.valuePropertyName] as string,
          label: item[dataSource.labelPropertyName] as string,
        }))
      : null;
  },
});

const updateParentWithResetValue = actions.sendParent<
  ContextFrom<typeof questionModel>,
  DoneInvokeEvent<FipsCode[]>,
  ExtractModelEvent<typeof stepModel, 'RECEIVE_VALUE_UPDATE'>
>((context, event) => {
  const { dataSource, initialValue } = context;
  const { valuePropertyName } = dataSource ?? {};

  const optionsValues = event.data.map(
    (item: Record<string, string>) => item[valuePropertyName ?? ''],
  );

  return {
    type: 'RECEIVE_VALUE_UPDATE',
    questionID: context.questionID,
    value: optionsValues.includes(initialValue) ? initialValue : '',
  };
});

export const questionActions = {
  updateValue,
  updateParentWithValue,
  syncParentWithCurrentValue,
  setDepValue,
  setActionsQueue,
  setKnockoutState,
  updateParentStep,
  assignNewOptions,
  updateParentWithResetValue,
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

const booleanMap = {
  yes: true,
  no: false,
};
