import { ActorRef, EventFrom, StateFrom, StateMachine } from 'xstate';
import { useSelector } from '@xstate/react';
import { Model } from 'xstate/lib/model.types';

import { ActionType } from 'types/actions';
import { Comparison, ComparisonType } from 'types/comparisons';
import { ActionsQueueItem } from './question/question.types';

export type NarrowEvent<
  Events,
  EventType extends Events[keyof Events],
> = Events extends { type: EventType } ? Events : never;

export type ExtractModelEvent<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TModel extends Model<any, any, any>,
  TEventType extends EventFrom<TModel>['type'],
> = Extract<EventFrom<TModel>, { type: TEventType }>;

export const shallowCompare = (
  obj1?: Record<string, string>,
  obj2?: Record<string, string>,
): boolean => {
  if (!obj1 || !obj2) {
    return false;
  }
  return (
    Object.keys(obj1).length === Object.keys(obj2).length &&
    Object.keys(obj1).every((key) => obj1[key] === obj2[key])
  );
};

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
export const evaluateComparison = (
  inputValue: string,
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
  inputValue: string,
  comparisonType: ComparisonType,
): string | boolean => {
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

export const evaluationOperatorMap = {
  or: (evaluatedComparisonsArray: boolean[]): boolean =>
    evaluatedComparisonsArray.some(Boolean),
  and: (evaluatedComparisonsArray: boolean[]): boolean =>
    evaluatedComparisonsArray.every(Boolean),
};

const booleanMap = {
  yes: true,
  no: false,
};

export const createSelectorHook = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TModel extends Model<any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TMachine extends StateMachine<any, any, any>,
>() => {
  return <Type extends unknown>(
    service: ActorRef<EventFrom<TModel>>,
    selector: (state: StateFrom<TMachine>) => Type,
  ): Type => {
    return useSelector(service, selector);
  };
};

export const createSelector = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TMachine extends StateMachine<any, any, any>,
>() => {
  return <Type>(
    selector: (state: StateFrom<TMachine>) => Type,
  ): ((state: StateFrom<TMachine>) => Type) => selector;
};
