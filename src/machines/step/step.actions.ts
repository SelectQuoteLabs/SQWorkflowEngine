import { actions, DoneInvokeEvent, spawn } from 'xstate';

import { shallowCompare } from 'machines/utils';
import {
  ExtractStepEvent,
  Knockout,
  StepContext,
  StepEvent,
  StepQuestion,
} from './step.types';
import { StepTypes } from 'types/steps';
import { EvaluationTypes } from 'types/evaluations';
import { ExtractWorkflowEvent } from 'machines/workflow/workflow.types';
import { textStepMachine } from 'machines/textStep.machine';
import { questionModel } from 'machines/question/question.machine';
import questionMachine from 'machines/question';

/** The 'SUBMIT' event is sent with the form's values and the `stepSummary`, this action assigns those to the machine context */
const setFormDetailsToContext = actions.assign<
  StepContext,
  ExtractStepEvent<'SUBMIT'>
>((context, event) => {
  const hasNewValues =
    context.hasNewValues ||
    !shallowCompare(event.payload.values, context.initialValues);

  return {
    values: event.payload.values,
    initialValues: event.payload.values,
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
  StepContext,
  ExtractStepEvent<'RECEIVE_QUESTION_UPDATE'>
>((context, event) => {
  const { questionActionsQueue } = context;
  const { actionsQueue, isKnockout, questionID } = event.payload;

  const updatedQueue = [...questionActionsQueue, ...actionsQueue];

  const newKnockout = { isKnockout, questionID };
  return {
    questionActionsQueue: updatedQueue,
    knockouts: generateNewKnockouts(context.knockouts, newKnockout),
  };
});

/** Creates an updated queue with the `actionToRemove` removed and assigns it to `questionActionsQueue` */
const removeActionFromQueue = actions.assign<
  StepContext,
  ExtractStepEvent<'REMOVE_ACTION_FROM_QUEUE'>
>((context, event) => {
  const { questionActionsQueue } = context;
  const { actionToRemove } = event;

  const updatedQueue = questionActionsQueue
    .map((questionAction) => {
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
const setInitialValues = actions.assign<StepContext, StepEvent>((context) => {
  const { childSteps } = context;
  const questions = childSteps
    .filter(
      (childStep): childStep is StepQuestion =>
        childStep.stepType === StepTypes.QUESTION,
    )
    .map((question) => {
      // Parses the question's `prePopulatedResponse` value, if it exists, to determine what the initial value should be
      const value = getValue(question.prePopulatedResponse?.value);
      return [question.questionID, value];
    });

  const valuesObject = Object.fromEntries(questions);
  return {
    initialValues: valuesObject,
    values: valuesObject,
  };
});

/** Spawns all of the question and text subSteps, each with the initial context that they need */
const initializeChildSteps = actions.assign<StepContext, StepEvent>(
  (context) => {
    const { childSteps } = context;
    return {
      childSteps: childSteps.map((childStep) => {
        if (childStep.stepType === StepTypes.QUESTION) {
          const initialValue = getValue(childStep.prePopulatedResponse?.value);

          return {
            ...childStep,
            ref: spawn(
              questionMachine.withContext({
                ...questionModel.initialContext,
                id: childStep.id,
                questionID: childStep.questionID,
                initialVisibility: childStep.isVisible,
                initialRequired: childStep.isRequired,
                initialValue,
                value: initialValue,
                onCompleteConditionalActions:
                  childStep.onCompleteConditionalActions,
                dataSource: childStep.dataSource,
              }),
              childStep.id,
            ),
          };
        } else {
          return {
            ...childStep,
            ref: spawn(
              textStepMachine.withContext({
                id: childStep.id,
                initialVisibility: childStep.isVisible,
              }),
              childStep.id,
            ),
          };
        }
      }),
    };
  },
);

/** Send data to parent workflowMachine */
const sendSummaryToParent = actions.sendParent<
  StepContext,
  | StepEvent
  | ExtractStepEvent<'SEND_RESPONSES_SUCCESS'>
  | ExtractStepEvent<'SEND_APPLICATION_SUCCESS'>,
  ExtractWorkflowEvent<'RECEIVE_STEP_SUMMARY'>
>((context) => {
  const { stepSummary, stepID } = context;
  return {
    type: 'RECEIVE_STEP_SUMMARY',
    stepSummary,
    stepID,
  };
});

const sendParentNextStep = actions.sendParent<
  StepContext,
  StepEvent | ExtractStepEvent<'SEND_APPLICATION_SUCCESS'>,
  ExtractWorkflowEvent<'GO_TO_STEP'>
>((context: StepContext) => ({
  type: 'GO_TO_STEP',
  stepID: context.nextStepID,
}));

/**
 * With the action and evaluation result from the event, this action determines which event to send to which child question/text machine.
 * https://xstate.js.org/docs/guides/actors.html#sending-events-to-actors
 */
const updateChildStepVisibility = actions.send<
  StepContext,
  ExtractStepEvent<'UPDATE_CHILD_STEP_VISIBILITY'>
>(
  (_context, event) => {
    const { updateStepVisibilityAction, evaluationResult } = event;
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
      const { id } =
        childSteps.find(
          (childStep) => childStep.id === updateStepVisibilityAction.stepId,
        ) ?? {};
      return id ?? '';
    },
  },
);

const updateMultiStepChildVisibility = actions.pure<
  StepContext,
  ExtractStepEvent<'UPDATE_MULTI_STEP_VISIBILITY'>
>((context, event) => {
  const { updateMultiStepVisibilityAction, evaluationResult } = event;
  /**
   * With `pure` you need to return the map, otherwise all the `send` actions within the map never get invoked
   */
  return updateMultiStepVisibilityAction.stepIds.map((id) => {
    return actions.send(
      {
        type:
          evaluationResult && updateMultiStepVisibilityAction.isVisible
            ? 'SHOW'
            : 'HIDE',
      },
      {
        to: id,
      },
    );
  });
});

/** This action is almost exactly the same as `updateChildStepVisibility` */
const updateChildStepRequired = actions.send<
  StepContext,
  ExtractStepEvent<'UPDATE_CHILD_STEP_REQUIRED'>
>(
  (_context, event) => {
    const { updateStepIsRequiredAction, evaluationResult } = event;

    if (
      (evaluationResult && updateStepIsRequiredAction.isRequired) ||
      (!evaluationResult && !updateStepIsRequiredAction.isRequired)
    ) {
      return { type: 'REQUIRED' };
    } else {
      return { type: 'NOT_REQUIRED' };
    }
  },
  {
    to: (context, event) => {
      const { childSteps } = context;
      const { updateStepIsRequiredAction } = event;
      const { id } =
        childSteps.find(
          (childStep) => childStep.id === updateStepIsRequiredAction.stepId,
        ) ?? {};

      return id ?? '';
    },
  },
);

const updateMultiStepChildRequired = actions.pure<
  StepContext,
  ExtractStepEvent<'UPDATE_MULTI_STEP_REQUIRED'>
>((context, event) => {
  const { updateMultiStepRequiredAction, evaluationResult } = event;

  return updateMultiStepRequiredAction.stepIds.map((id) => {
    const type =
      (evaluationResult && updateMultiStepRequiredAction.isRequired) ||
      (!evaluationResult && !updateMultiStepRequiredAction.isRequired)
        ? 'REQUIRED'
        : 'NOT_REQUIRED';

    return actions.send(
      {
        type,
      },
      {
        to: id,
      },
    );
  });
});

const sendDataSourceRefs = actions.pure<StepContext, StepEvent>((context) => {
  const questionsArray = context.childSteps.filter(
    (childStep): childStep is StepQuestion =>
      childStep.stepType === StepTypes.QUESTION,
  );

  const questionsWithDataSource = questionsArray.filter((question) =>
    Boolean(question.dataSource),
  );

  const valueSourceQuestionIDs = [
    ...new Set(
      questionsWithDataSource
        .flatMap((question) => {
          return question.dataSource?.queryStringParameters.map(
            (param) => param.questionId,
          );
        })
        .filter(Boolean),
    ),
  ];

  const dataSourceDependencyMap = Object.fromEntries(
    valueSourceQuestionIDs.map((valueSourceQuestionID) => {
      const refsOfQuestionsThatNeedValue = questionsWithDataSource
        .filter((question) => {
          const { dataSource } = question;
          return dataSource?.queryStringParameters.some(
            (param) => param.questionId === valueSourceQuestionID,
          );
        })
        .map((question) => question.ref);

      return [valueSourceQuestionID, refsOfQuestionsThatNeedValue];
    }),
  );

  return Object.keys(dataSourceDependencyMap).map((valueSourceQuestionID) => {
    const { id: machineID } =
      questionsArray.find(
        (question) => question.questionID === valueSourceQuestionID,
      ) ?? {};

    return actions.send(
      {
        type: 'RECEIVE_DATA_SOURCE_REFS',
        refs: dataSourceDependencyMap[valueSourceQuestionID],
      },
      {
        to: machineID ?? '',
      },
    );
  });
});

const sendConditionalRefs = actions.pure<StepContext, StepEvent>((context) => {
  return context.childSteps
    .filter(
      (childStep): childStep is StepQuestion =>
        childStep.stepType === StepTypes.QUESTION,
    )
    .map((childStep, _index, childStepsArray) => {
      const { id, onCompleteConditionalActions } = childStep;

      const allQuestionIDs = onCompleteConditionalActions?.reduce(
        (acc: string[], item) => {
          const { evaluation } = item;

          if (evaluation.evaluationType === EvaluationTypes.QUESTION) {
            acc.push(evaluation.questionId);
          } else if (evaluation.evaluationType === EvaluationTypes.GROUP) {
            const questionIDs = evaluation.evaluations.map(
              (item) => item.questionId,
            );
            acc.push(...questionIDs);
          }

          return acc;
        },
        [],
      );

      const uniqueQuestionIDs = [...new Set(allQuestionIDs)].filter(
        (questionID) => questionID !== childStep.questionID,
      );

      const refs = uniqueQuestionIDs.map((questionID) => {
        return childStepsArray.find((step) => step.questionID === questionID)
          ?.ref;
      });

      return actions.send(
        { type: 'RECEIVE_CONDITIONAL_REFS', refs },
        { to: Boolean(refs.length) ? id : '' },
      );
    });
});

const assignReturnedValues = actions.assign({
  values: (
    _context,
    event: DoneInvokeEvent<{
      returnValues: StepContext['values'];
    }>,
  ) => event.data.returnValues,
});

export const stepActions = {
  setFormDetailsToContext,
  setUpdatesFromQuestionToContext,
  removeActionFromQueue,
  setInitialValues,
  initializeChildSteps,
  sendSummaryToParent,
  sendParentNextStep,
  updateChildStepVisibility,
  updateMultiStepChildVisibility,
  updateChildStepRequired,
  updateMultiStepChildRequired,
  sendConditionalRefs,
  sendDataSourceRefs,
  assignReturnedValues,
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
