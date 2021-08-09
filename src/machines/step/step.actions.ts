import { actions, AssignAction, ContextFrom, EventFrom, spawn } from 'xstate';

import { ExtractModelEvent, shallowCompare } from '../utils';
import { Knockout, StepQuestion, StepText } from './step.types';
import { StepTypes } from '../../types/steps';
import { textStepMachine } from '../textStep.machine';
import { workflowModel } from '../workflow/workflow.machine';
import { questionModel } from '../question/question.machine';
import questionMachine from '../question';
import { stepModel } from './step.machine';

const setHasNewValues = (
  value: boolean,
): AssignAction<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'RECEIVE_VALUE_UPDATE'>
> =>
  actions.assign<
    ContextFrom<typeof stepModel>,
    ExtractModelEvent<typeof stepModel, 'RECEIVE_VALUE_UPDATE'>
  >({
    hasNewValues: value,
  });

/** The 'SUBMIT' event is sent with the form's values and the `stepSummary`, this action assigns those to the machine context */
const setFormDetailsToContext = actions.assign<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'SUBMIT'>
>((context, event) => {
  const hasNewValues =
    context.hasNewValues ||
    (!shallowCompare(event.payload.values, context.values) &&
      !shallowCompare(event.payload.values, context.initialValues));
  return {
    values: event.payload.values,
    stepSummary: event.payload.stepSummary,
    hasNewValues,
    parentUpdated: hasNewValues,
    wasSubmitted: true,
  };
});

/**
 * When a question is changed the questionMachine will send an update to the it's parent stepMachine with any actions it needs to perform
 * and the knockout state that may have changed based on the question's value.
 */
const setUpdatesFromQuestionToContext = actions.assign<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'RECEIVE_QUESTION_UPDATE'>
>((context, event) => {
  const { questionActionsQueue } = context;
  const { actionsQueue, isKnockout, questionID } = event.payload;

  const updatedQueue = [...(questionActionsQueue || []), ...actionsQueue];

  const newKnockout = { isKnockout, questionID };
  return {
    questionActionsQueue: updatedQueue,
    knockouts: generateNewKnockouts(context.knockouts, newKnockout),
  };
});

/** Creates an updated queue with the `actionToRemove` removed and assigns it to `questionActionsQueue` */
const removeActionFromQueue = actions.assign<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'REMOVE_ACTION_FROM_QUEUE'>
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
});

/** Set the `initialValues` for the form within the step based on the step's questions */
const setInitialValues = actions.assign<
  ContextFrom<typeof stepModel>,
  EventFrom<typeof stepModel>
>((context) => {
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
});

/** Creates array of all dataSource dependency questionIDs */
const setDataSourceDependencies = actions.assign<
  ContextFrom<typeof stepModel>,
  EventFrom<typeof stepModel>
>({
  dataSourceDependencies: (context) => {
    const { childSteps } = context;
    const dependencies = childSteps
      ?.filter(
        (childStep): childStep is StepQuestion =>
          childStep.stepType === StepTypes.QUESTION &&
          Boolean(childStep.dataSource),
      )
      .map((questionStep) => {
        const { dataSource, id } = questionStep;
        const [questionID] =
          dataSource?.queryStringParameters.map((item) => item.questionId) ??
          [];

        return {
          questionID,
          originID: id,
        };
      })
      .filter(
        (
          dependency,
        ): dependency is {
          questionID: string;
          originID: string;
        } => !!dependency,
      );
    return dependencies;
  },
});

/** Spawns all of the question and text subSteps, each with the initial context that they need */
const initializeChildSteps = actions.assign<
  ContextFrom<typeof stepModel>,
  EventFrom<typeof stepModel>
>((context) => {
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
                ...questionModel.initialContext,
                id: childStep.id,
                questionID: childStep.questionID,
                initialVisibility: childStep.isVisible,
                initialRequired: childStep.isRequired,
                initialValue: getValue(childStep.prePopulatedResponse?.value),
                onCompleteConditionalActions:
                  childStep.onCompleteConditionalActions,
                dataSource: childStep.dataSource,
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
});

const updateValues = actions.assign<
  ContextFrom<typeof stepModel>,
  | ExtractModelEvent<typeof stepModel, 'RECEIVE_VALUE_UPDATE'>
  | ExtractModelEvent<typeof stepModel, 'RECEIVE_SYNC_UPDATE'>
>({
  values: (context, event) => ({
    ...context.values,
    [event.questionID]: event.value,
  }),
});

/** Send data to parent workflowMachine */
const sendSummaryToParent = actions.sendParent<
  ContextFrom<typeof stepModel>,
  | EventFrom<typeof stepModel>
  | ExtractModelEvent<typeof stepModel, 'SEND_RESPONSES_SUCCESS'>
  | ExtractModelEvent<typeof stepModel, 'SEND_APPLICATION_SUCCESS'>,
  ExtractModelEvent<typeof workflowModel, 'RECEIVE_STEP_SUMMARY'>
>((context) => {
  const { stepSummary, stepID } = context;
  return {
    type: 'RECEIVE_STEP_SUMMARY',
    stepSummary,
    stepID,
  };
});

const sendParentNextStep = actions.sendParent<
  ContextFrom<typeof stepModel>,
  | EventFrom<typeof stepModel>
  | ExtractModelEvent<typeof stepModel, 'SEND_APPLICATION_SUCCESS'>,
  ExtractModelEvent<typeof workflowModel, 'GO_TO_STEP'>
>((context: ContextFrom<typeof stepModel>) => ({
  type: 'GO_TO_STEP',
  stepID: context.nextStepID,
}));

const sendDepInitialValuesToDataSources = actions.pure<
  ContextFrom<typeof stepModel>,
  EventFrom<typeof stepModel>
>((context) => {
  const { initialValues, childSteps } = context;
  return initialValues
    ? context.dataSourceDependencies?.map((dependency) => {
        const { questionID, originID } = dependency;

        return actions.send(
          {
            type: initialValues[questionID] ? 'FETCH_DATA_SOURCE' : '',
            value: initialValues[questionID],
          },
          {
            to: () => {
              const { ref } =
                childSteps?.find((childStep) => childStep.id === originID) ??
                {};
              if (typeof ref === 'undefined') {
                throw new Error(`childStep ${originID} ref is undefined`);
              }
              return ref;
            },
          },
        );
      })
    : undefined;
});

const requestSyncAllValues = actions.pure<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'RECEIVE_VALUE_UPDATE'>
>((context) => {
  return context.childSteps
    ?.filter(
      (childStep): childStep is StepQuestion =>
        childStep.stepType === StepTypes.QUESTION,
    )
    .map((childStep) => {
      const { ref, id } = childStep;
      if (typeof ref === 'undefined') {
        throw new Error(`childStep ${id} ref is undefined`);
      }
      return actions.send(
        {
          type: 'SYNC_PARENT_WITH_CURRENT_VALUE',
        },
        {
          to: (_context) => ref,
        },
      );
    });
});

const sendDataSourceDepUpdate = actions.send<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'RECEIVE_VALUE_UPDATE'>
>(
  (_context, event) => ({
    type: 'FETCH_DATA_SOURCE',
    value: event.value,
  }),
  {
    to: (context, event) => {
      const { dataSourceDependencies, childSteps } = context;
      const childID = dataSourceDependencies?.find(
        (dependency) => dependency.questionID === event.questionID,
      )?.originID;
      if (typeof childID === 'undefined') {
        throw new Error('dataSource origin ID is undefined');
      }
      const ref = childSteps?.find(
        (childStep) => childStep.id === childID,
      )?.ref;
      if (typeof ref === 'undefined') {
        throw new Error('ref of dataSource origin ID is undefined');
      }
      return ref;
    },
  },
);

/**
 * With the action and evaluation result from the event, this action determines which event to send to which child question/text machine.
 * https://xstate.js.org/docs/guides/actors.html#sending-events-to-actors
 */
const updateChildStepVisibility = actions.send<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'UPDATE_CHILD_STEP_VISIBILITY'>
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
          (childStep) => childStep.id === updateStepVisibilityAction?.stepId,
        ) ?? {};
      if (typeof ref === 'undefined') {
        throw new Error(`childStep ${id} ref is undefined`);
      }
      return ref;
    },
  },
);

const updateMultiStepChildVisibility = actions.pure<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'UPDATE_MULTI_STEP_VISIBILITY'>
>((context, event) => {
  const { childSteps } = context;
  const { updateMultiStepVisibilityAction, evaluationResult } = event;
  if (typeof updateMultiStepVisibilityAction === 'undefined') {
    throw new Error('updateMultiStepVisibilityAction not found');
  }
  /**
   * With `pure` you need to return the map, otherwise all the `send` actions within the map never get invoked
   */
  return updateMultiStepVisibilityAction.stepIds.map((stepID) => {
    const ref = childSteps?.find((childStep) => childStep.id === stepID)?.ref;
    if (typeof ref === 'undefined') {
      throw new Error(`childStep ${stepID} ref is undefined`);
    }
    return actions.send(
      {
        type:
          evaluationResult && updateMultiStepVisibilityAction.isVisible
            ? 'SHOW'
            : 'HIDE',
      },
      {
        to: () => ref,
      },
    );
  });
});

/** This action is almost exactly the same as `updateChildStepVisibility` */
const updateChildStepRequired = actions.send<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'UPDATE_CHILD_STEP_REQUIRED'>
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
          (childStep) => childStep.id === updateStepIsRequiredAction?.stepId,
        ) ?? {};
      if (typeof ref === 'undefined') {
        throw new Error(`childStep ${id} ref is undefined`);
      }
      return ref;
    },
  },
);

const updateMultiStepChildRequired = actions.pure<
  ContextFrom<typeof stepModel>,
  ExtractModelEvent<typeof stepModel, 'UPDATE_MULTI_STEP_REQUIRED'>
>((context, event) => {
  const { childSteps } = context;
  const { updateMultiStepRequiredAction, evaluationResult } = event;

  if (typeof updateMultiStepRequiredAction === 'undefined') {
    throw new Error('updateMultiStepRequiredAction not found');
  }

  return updateMultiStepRequiredAction.stepIds.map((stepID) => {
    const ref = childSteps?.find((childStep) => childStep.id === stepID)?.ref;

    if (typeof ref === 'undefined') {
      throw new Error(`childStep ${stepID} ref is undefined`);
    }

    let type: string;
    if (
      (evaluationResult && updateMultiStepRequiredAction.isRequired) ||
      (!evaluationResult && !updateMultiStepRequiredAction.isRequired)
    ) {
      type = 'REQUIRED';
    } else {
      type = 'NOT_REQUIRED';
    }

    return actions.send(
      {
        type,
      },
      {
        to: () => ref,
      },
    );
  });
});

export const stepActions = {
  setHasNewValues,
  setFormDetailsToContext,
  setUpdatesFromQuestionToContext,
  removeActionFromQueue,
  setInitialValues,
  setDataSourceDependencies,
  initializeChildSteps,
  updateValues,
  sendSummaryToParent,
  sendParentNextStep,
  sendDepInitialValuesToDataSources,
  requestSyncAllValues,
  sendDataSourceDepUpdate,
  updateChildStepVisibility,
  updateMultiStepChildVisibility,
  updateChildStepRequired,
  updateMultiStepChildRequired,
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

const generateNewKnockouts = (
  knockoutList: Knockout[],
  updateKnockout: Knockout,
): Knockout[] => {
  if (!updateKnockout) {
    return knockoutList;
  }

  //Find if knockout already exists
  const foundIndex = knockoutList.findIndex(
    (knockout) => knockout.questionID === updateKnockout.questionID,
  );

  //Knockout already in knockoutList
  if (foundIndex >= 0) {
    if (updateKnockout.isKnockout) {
      //Add or replace
      if (foundIndex !== knockoutList.length - 1) {
        const beforeIndex = knockoutList.slice(0, foundIndex);
        const afterIndex = knockoutList.slice(foundIndex + 1);

        return [...beforeIndex, ...afterIndex, updateKnockout];
      }

      return [...knockoutList, updateKnockout];
    }

    //Else just remove
    const filteredKnockouts = knockoutList.filter(
      (knockout) => knockout.questionID !== updateKnockout.questionID,
    );

    return filteredKnockouts;
  }

  //Knockout doesn't exist in knockoutList, so add it
  if (updateKnockout.isKnockout) {
    return [...knockoutList, updateKnockout];
  }

  return knockoutList;
};
