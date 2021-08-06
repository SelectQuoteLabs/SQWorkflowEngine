import { useSelector } from '@xstate/react';
import { ActorRef, EventFrom, StateFrom, StateMachine } from 'xstate';

import { ActionType } from 'types/actions';
import { Model } from 'xstate/lib/model.types';
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
