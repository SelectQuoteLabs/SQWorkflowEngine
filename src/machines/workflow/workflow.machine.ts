import { assign } from 'xstate';
import { createModel } from 'xstate/lib/model';
// import { useSelector } from '@xstate/react';

import { Workflow } from '../../types/workflow';
import { WorkflowStep, StepSummary } from './workflow.types';
import { workflowActions } from './workflow.actions';
import { createSelector } from '../../machines/utils';
// import { useWorkflowService } from 'contexts/GlobalServices';

type WorkflowContext = {
  applicationSubmitted: boolean;
  steps: WorkflowStep[];
  nextStepID: string;
  currentStepID: string;
};

export const workflowModel = createModel(
  {
    applicationSubmitted: false,
    steps: [],
    nextStepID: '',
    currentStepID: '',
  } as WorkflowContext,
  {
    events: {
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
  states: {
    waitingForWorkflowData: {
      id: 'waitingForWorkflowData',
      entry: ['entryWaitingForWorkflowData'],
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
      exit: ['exitWaitingForWorkflowData'],
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

// export const useWorkflowSelector = <Type extends unknown>(
//   selector: (state: StateFrom<typeof workflowMachine>) => Type,
// ): Type => {
//   const service = useWorkflowService();
//   return useSelector(service, selector);
// };

const createWorkflowSelector = createSelector<typeof workflowMachine>();

export const getSteps = createWorkflowSelector((state) => state.context.steps);

export const getCurrentStepID = createWorkflowSelector(
  (state) => state.context.currentStepID,
);

export const getIsWorkflowDataLoaded = createWorkflowSelector((state) =>
  state.matches('workflowDataLoaded'),
);
