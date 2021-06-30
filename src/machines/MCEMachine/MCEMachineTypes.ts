import { StateSchema } from 'xstate';
import {
  StepQuestion,
  StepText,
  StepMachineRef,
} from 'machines/stepMachine/stepMachineTypes';
import { Application } from 'types/application';

export type MCEMachineContext = {
  applicationKey: string | null;
  application?: Application;
  steps: MCEStep[];
  nextStepID: string;
  currentStepID: string;
  knockout: Knockout;
  globalLoadingMessage: string;
  successMessage: string;
  error: {
    errorData: Error | null;
    message: string;
  };
};

export type MCEMachineEvent =
  | {
      type: 'RECEIVE_UPDATE_FROM_CHILD';
      payload: {
        stepID: string;
        stepSummary: StepSummary;
      };
    }
  | {
      type: 'SET_GLOBAL_LOADING_MESSAGE';
      message: string;
    }
  | {
      type: 'SET_SUCCESS_MESSAGE';
      message: string;
    }
  | {
      type: 'SET_ERROR';
      error: {
        errorData: Error | null;
        message: string;
      };
    }
  | {
      type: 'GO_TO_STEP';
      stepID: string;
    }
  | {
      type: 'REFETCH_WORKFLOW';
    }
  | {
      type: 'CLEAR_GLOBAL_LOADING_MESSAGE';
    };

export type MCEMachineState =
  | { value: 'fetchingApplication'; context: MCEMachineContext }
  | {
      value: 'fetchingWorkflow';
      context: MCEMachineContext & { application: Application };
    }
  | {
      value: 'initialized';
      context: MCEMachineContext;
    }
  | {
      value: { initialized: 'idle' };
      context: MCEMachineContext;
    };

export type MCEStateSchema = StateSchema<MCEMachineContext>;

export interface QuestionDetails {
  questionID: string;
  question: string | undefined;
  answer: string;
}

export type StepSummary = QuestionDetails[];

export type ChildStep = StepQuestion | StepText;

export interface MCEStep {
  stepID: string;
  stepName: string;
  nextStepID: string;
  childSteps?: ChildStep[];
  ref?: StepMachineRef;
  stepSummary?: StepSummary;
  hasPassWorkflow?: boolean;
}

export interface Knockout {
  isKnockout: boolean;
  questionID: string;
}
