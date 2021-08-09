import { actions, spawn, ContextFrom, EventFrom } from 'xstate';

import { ExtractModelEvent } from '../utils';
import { ActionTypes, NextStepAction } from '../../types/actions';
import { QuestionTypes } from '../../types/questions';
import {
  GroupStep,
  QuestionStep,
  TextStep,
  StepTypes,
} from '../../types/steps';
import { ChildStep, WorkflowStep } from './workflow.types';
import { workflowModel } from './workflow.machine';
import stepMachine from '../step';
import { stepModel } from '../step/step.machine';

const clearGlobalLoadingMessage = actions.assign<
  ContextFrom<typeof workflowModel>,
  EventFrom<typeof workflowModel>
>({
  globalLoadingMessage: '',
});

/**
 * Using the data returned from the invoked fetchWorkflow promise, create a steps array that includes all of the data needed for each
 * child step machine and assign it to the `steps` property in context. Also sets up the first step machine to be created by assigning
 * the `firstStepID` from the workflow data to the `currentStepID` property in context.
 */
const setStepsData = actions.assign<
  ContextFrom<typeof workflowModel>,
  ExtractModelEvent<typeof workflowModel, 'RECEIVE_WORKFLOW_DATA'>
>((_context, event) => {
  if (!event.data) {
    return {};
  }

  const { steps, firstStepId: firstStepID } = event.data;
  const stepsArray = buildStepsArray(steps);

  return {
    steps: stepsArray,
    currentStepID: firstStepID,
  };
});

const spawnAllSteps = actions.assign<
  ContextFrom<typeof workflowModel>,
  ExtractModelEvent<typeof workflowModel, 'RECEIVE_WORKFLOW_DATA'>
>((context) => {
  const { steps, applicationSubmitted } = context;
  return {
    steps: steps.map((step) => {
      return {
        /**
         * Assigns to the `steps` property a copy of `steps` with the addition of a new spawned stepMachine `ref` for each step. This new
         * step machine is initialized with all of the data it needs by utilizing `withContext`.
         */
        ...step,
        ref: spawn(
          stepMachine.withContext({
            ...stepModel.initialContext,
            stepID: step.stepID,
            nextStepID: step.nextStepID,
            childSteps: step.childSteps,
            hasPassWorkflow: step.hasPassWorkflow,
            applicationSubmitted,
          }),
          step.stepName,
        ) as WorkflowStep['ref'],
      };
    }),
  };
});

/**
 * When a child step machine needs to update this machine with some new data it will use the 'RECEIVE_UPDATE_FROM_CHILD' event to do so.
 * Currently this event is specifically set up to allow a `stepSummary` and `stepID` to be sent along with it, but any data could
 * potentially be included in the payload.
 */
const updateStepSummary = actions.assign<
  ContextFrom<typeof workflowModel>,
  ExtractModelEvent<typeof workflowModel, 'RECEIVE_STEP_SUMMARY'>
>((context, event) => {
  const { stepSummary, stepID } = event;

  return {
    // Using the `stepID`, add the `stepSummary` to the corresponding step data in the `steps` array.
    steps: context.steps.map((step) => {
      return step.stepID === stepID ? { ...step, stepSummary } : step;
    }),
  };
});

/** Assigns the `currentStepID` to the `stepID` that was sent along with the event */
const setCurrentStep = actions.assign<
  ContextFrom<typeof workflowModel>,
  ExtractModelEvent<typeof workflowModel, 'GO_TO_STEP'>
>({
  currentStepID: (_context, event) => event.stepID,
});

export const workflowActions = {
  clearGlobalLoadingMessage,
  setStepsData,
  spawnAllSteps,
  updateStepSummary,
  setCurrentStep,
};

type StepsArray = Pick<
  WorkflowStep,
  'stepID' | 'stepName' | 'nextStepID' | 'childSteps' | 'hasPassWorkflow'
>[];

/** Takes the `steps` array from the workflow data and builds a new steps array that only includes the data we need to spawn each step's machine. */
const buildStepsArray = (stepsArray: GroupStep[]): StepsArray =>
  stepsArray.reduce((acc: StepsArray, step) => {
    const {
      headerText: stepName,
      id: stepID,
      subSteps,
      onCompleteConditionalActions,
    } = step;

    /** Sets up the child question and text subSteps that are within each step */
    const childSteps = subSteps
      .filter(
        (step): step is QuestionStep | TextStep =>
          step.stepType === StepTypes.QUESTION ||
          step.stepType === StepTypes.TEXT,
      )
      .reduce((acc: ChildStep[], step) => {
        const { id, isVisible, onCompleteConditionalActions } = step;
        if (step.stepType === StepTypes.QUESTION) {
          const { isRequired } = step;
          const {
            question: { id: questionID, prePopulatedResponse, questionType },
          } = step;
          const dataSource =
            step.question.questionType === QuestionTypes.MULTIPLECHOICE
              ? step.question.dataSource
              : null;
          const options =
            step.question.questionType === QuestionTypes.MULTIPLECHOICE
              ? step.question.values
              : null;

          acc.push({
            stepType: step.stepType,
            id,
            questionID,
            isVisible,
            isRequired,
            onCompleteConditionalActions,
            prePopulatedResponse,
            questionType,
            dataSource,
            options,
          });
        } else if (step.stepType === StepTypes.TEXT) {
          acc.push({
            stepType: step.stepType,
            id,
            isVisible,
          });
        }
        return acc;
      }, []);

    /** The `nextStepID` for each step is based on its 'nextStep' conditional action in the workflow data */
    const nextStepID =
      onCompleteConditionalActions?.reduce((_acc, current) => {
        const { stepId } =
          (current.actions.find(
            (action) => action.actionType === 'nextStep',
          ) as NextStepAction) ?? {};
        return stepId;
      }, '') ?? '';

    /** The `hasPassWorkflow` indicates if the step is the Summary step */
    const hasPassWorkflow = Boolean(
      onCompleteConditionalActions?.some((item) =>
        item.actions.find(
          (action) => action.actionType === ActionTypes.PASSWORKFLOW,
        ),
      ),
    );

    acc.push({ stepName, stepID, nextStepID, childSteps, hasPassWorkflow });
    return acc;
  }, []);
