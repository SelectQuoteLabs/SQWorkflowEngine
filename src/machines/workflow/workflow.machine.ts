import { assign, actions } from 'xstate';
import { createModel } from 'xstate/lib/model';

import { Workflow } from '../../types/workflow';
import { WorkflowStep, StepSummary } from './workflow.types';
import { workflowActions } from './workflow.actions';
import { createSelector } from '../utils';

type ErrorContext = { errorData: Error | null; message: string };

type WorkflowContext = {
  applicationSubmitted: boolean;
  steps: WorkflowStep[];
  nextStepID: string;
  currentStepID: string;
  globalLoadingMessage: string;
  successMessage: string;
  error: ErrorContext;
};

export const workflowModel = createModel(
  {
    applicationSubmitted: false,
    steps: [],
    nextStepID: '',
    currentStepID: '',
    globalLoadingMessage: '',
    successMessage: '',
    error: {
      errorData: null,
      message: '',
    },
  } as WorkflowContext,
  {
    events: {
      SET_GLOBAL_LOADING_MESSAGE: (message: string) => ({ message }),
      SET_SUCCESS_MESSAGE: (message: string) => ({ message }),
      SET_ERROR: (error: ErrorContext) => ({ error }),
      RECEIVE_WORKFLOW_DATA: (
        data: Workflow | null,
        applicationSubmitted: boolean,
      ) => ({ data, applicationSubmitted }),
      RECEIVE_STEP_SUMMARY: (stepSummary: StepSummary, stepID: string) => ({
        stepSummary,
        stepID,
      }),
      GO_TO_STEP: (stepID: string) => ({ stepID }),
      REFETCH_APPLICATION: () => ({}),
    },
  },
);

const workflowMachine = workflowModel.createMachine({
  id: 'workflowMachine',
  initial: 'waitingForWorkflowData',
  context: workflowModel.initialContext,
  on: {
    SET_GLOBAL_LOADING_MESSAGE: {
      actions: [
        assign({
          globalLoadingMessage: (_context, event) => event.message,
        }),
      ],
    },
    SET_SUCCESS_MESSAGE: {
      actions: [
        workflowModel.assign({
          successMessage: (_context, event) => event.message,
        }),
      ],
    },
    SET_ERROR: {
      actions: [
        workflowModel.assign({
          error: (_context, event) => {
            const { error } = event;
            return { errorData: error.errorData, message: error.message };
          },
        }),
      ],
    },
  },
  states: {
    waitingForWorkflowData: {
      id: 'waitingForWorkflowData',
      entry: [
        actions.send({
          type: 'SET_GLOBAL_LOADING_MESSAGE',
          message: 'Loading Enrollment',
        }),
      ],
      on: {
        RECEIVE_WORKFLOW_DATA: {
          target: 'workflowDataLoaded.idle',
          actions: [
            assign({
              applicationSubmitted: (_context, event) =>
                event.applicationSubmitted,
            }),
            workflowActions.setStepsData,
            workflowActions.spawnAllSteps,
          ],
        },
      },
      exit: [
        workflowActions.clearGlobalLoadingMessage,
        actions.send({
          type: 'SET_SUCCESS_MESSAGE',
          message: 'Enrollment successfully loaded',
        }),
      ],
    },
    workflowDataLoaded: {
      id: 'workflowDataLoaded',
      initial: 'idle',
      states: {
        idle: {
          id: 'idle',
          on: {
            RECEIVE_STEP_SUMMARY: {
              actions: [workflowActions.updateStepSummary],
            },
            GO_TO_STEP: {
              actions: [workflowActions.setCurrentStep],
            },
            REFETCH_APPLICATION: {
              target: '#waitingForWorkflowData',
              actions: ['refetchData'],
            },
          },
        },
      },
    },
  },
});

export default workflowMachine;

const createWorkflowSelector = createSelector<typeof workflowMachine>();

export const getSteps = createWorkflowSelector((state) => state.context.steps);

export const getCurrentStepID = createWorkflowSelector(
  (state) => state.context.currentStepID,
);

export const getGlobalLoadingMessage = createWorkflowSelector(
  (state) => state.context.globalLoadingMessage,
);

export const getSuccessMessage = createWorkflowSelector(
  (state) => state.context.successMessage,
);

export const getErrorMessage = createWorkflowSelector(
  (state) => state.context.error.message,
);

export const getIsWorkflowDataLoaded = createWorkflowSelector((state) =>
  state.matches('workflowDataLoaded'),
);
