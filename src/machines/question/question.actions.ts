import { actions, DoneInvokeEvent } from 'xstate';

import { findActionInQueue } from '../../machines/utils';
import { ActionTypes, FailWorkflowAction } from '../../types/actions';
import {
  ActionsQueueItem,
  ExtractQuestionEvent,
  QuestionContext,
  QuestionEvent,
} from './question.types';
import { FipsCode } from '../../types/dataSource';
import { ExtractStepEvent } from '../../machines/step/step.types';

/** Assigns the `value` from the event to the `value` in context */
const updateValue = actions.assign<
  QuestionContext,
  ExtractQuestionEvent<'UPDATE_VALUE'>
>({
  value: (_context, event) => {
    return event.value;
  },
});

const setDepValue = actions.assign<
  QuestionContext,
  ExtractQuestionEvent<'FETCH_DATA_SOURCE'>
>({
  dataSourceDepValue: (_context, event) => event.value,
});

/**
 * When a question has a `failWorkflow` action we want to store the details of that to context. We store an `isKnockout` boolean, the knockout
 * message from the `failWorkflow` action, and the updated `actionsQueue` with the `failWorkflow` action removed.
 */
const setKnockoutState = actions.assign<QuestionContext, QuestionEvent>(
  (context) => {
    const actionInQueue = findActionInQueue(
      context.actionsQueue,
      ActionTypes.FAILWORKFLOW,
    ) as ActionsQueueItem;
    const { actions, evaluationResult } = actionInQueue;
    const failAction = actions.find((action): action is FailWorkflowAction => {
      return action.actionType === ActionTypes.FAILWORKFLOW;
    });
    const message = evaluationResult ? failAction?.displayText : null;
    const updatedQueue = context.actionsQueue.filter(
      (item) => item !== actionInQueue,
    );
    return {
      isKnockout: evaluationResult,
      knockoutMessage: message,
      actionsQueue: updatedQueue,
    };
  },
);

/** Updates the parent stepMachine with the actions it needs to perform, the current knockout state, and the question's ID */
const updateParentStep = actions.sendParent<
  QuestionContext,
  QuestionEvent,
  ExtractStepEvent<'RECEIVE_QUESTION_UPDATE'>
>((context) => {
  const { actionsQueue, isKnockout, questionID } = context;
  return {
    type: 'RECEIVE_QUESTION_UPDATE',
    payload: { actionsQueue, isKnockout, questionID },
  };
});

const assignNewOptions = actions.assign<
  QuestionContext,
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

const sendValueToDataSourceRefs = actions.pure<
  QuestionContext,
  QuestionEvent | ExtractQuestionEvent<'UPDATE_VALUE'>
>((context, event) => {
  const { dataSourceRefs, value } = context;

  return dataSourceRefs.map((ref) => {
    return actions.send(
      { type: 'FETCH_DATA_SOURCE', value },
      { to: () => ref },
    );
  });
});

const assignValueFromDataSource = actions.assign<
  QuestionContext,
  DoneInvokeEvent<FipsCode[]>
>({
  value: (context, event) => {
    const { dataSource, initialValue } = context;
    const { valuePropertyName } = dataSource ?? {};
    const optionsValues = event.data.map(
      (item: Record<string, string>) => item[valuePropertyName ?? ''],
    );

    if (optionsValues.includes(initialValue)) {
      return initialValue;
    } else if (optionsValues.length === 1) {
      return optionsValues[0] ?? '';
    }

    return '';
  },
});

const sendParentSyncValues = actions.sendParent<
  QuestionContext,
  DoneInvokeEvent<unknown>,
  ExtractStepEvent<'SYNC_VALUES'>
>({ type: 'SYNC_VALUES' });

const clearOptions = actions.assign((_context) => ({
  value: '',
  options: [{ label: '- -', value: '' }],
}));

export const questionActions = {
  updateValue,
  setDepValue,
  setKnockoutState,
  updateParentStep,
  assignNewOptions,
  sendValueToDataSourceRefs,
  assignValueFromDataSource,
  sendParentSyncValues,
  clearOptions,
};
