import { StateSchema, Interpreter } from 'xstate';

import { ConditionalActions } from 'types/evaluations';
import {
  Action,
  UpdateStepIsRequiredAction,
  UpdateStepVisibilityAction,
} from 'types/actions';
import { PrePopulatedResponse, QuestionType } from 'types/questions';
import {
  ActionsQueueItem,
  QuestionMachineRef,
} from 'machines/questionMachine/questionMachineTypes';
import {
  ChildStep,
  StepSummary,
  Knockout,
} from '../MCEMachine/MCEMachineTypes';
import { TextStepMachineRef } from 'machines/textStepMachine';

export interface StepMachineContext {
  stepID: string;
  nextStepID: string;
  childSteps: ChildStep[] | undefined;
  workflowID: string;
  applicationKey: string | null;
  values?: Record<string, string>;
  initialValues?: Record<string, string>;
  hasNewValues?: boolean;
  hasPassWorkflow?: boolean;
  stepSummary?: StepSummary;
  knockout?: Knockout;
  questionActionsQueue?: ActionsQueueItem[];
  wasSubmitted: boolean;
  confirmationID: string;
}

export type StepMachineEvent =
  | {
      type: 'SUBMIT';
      payload: {
        values: Record<string, string>;
        stepSummary: StepSummary;
      };
    }
  | { type: 'UPDATE_PARENT'; payload: unknown }
  | {
      type: 'RECEIVE_QUESTION_UPDATE';
      payload: {
        actionsQueue: ActionsQueueItem[];
        isKnockout: boolean;
        questionID: string;
      };
    }
  | { type: 'DONE' }
  | {
      type: 'UPDATE_CHILD_STEP_VISIBILITY';
      updateStepVisibilityAction: UpdateStepVisibilityAction | undefined;
      evaluationResult: boolean;
    }
  | {
      type: 'UPDATE_CHILD_STEP_REQUIRED';
      updateStepIsRequiredAction: UpdateStepIsRequiredAction | undefined;
      evaluationResult: boolean;
    }
  | {
      type: 'REMOVE_ACTION_FROM_QUEUE';
      actionToRemove: Action;
    };

export type StepMachineState =
  | {
      value: 'initializing';
      context: StepMachineContext;
    }
  | {
      value: 'idle';
      context: StepMachineContext;
    }
  | {
      value: 'submitting';
      context: StepMachineContext;
    }
  | {
      value:
        | { submitting: 'checkingSubmittedValues' }
        | { submitting: 'sendingWorkflowResponses' }
        | { submitting: 'submittingApplication' }
        | { submitting: 'updatingParent' };
      context: StepMachineContext;
    }
  | {
      value: 'performingActions';
      context: StepMachineContext;
    }
  | {
      value: 'complete';
      context: StepMachineContext;
    }
  | {
      value: 'cancelled';
      context: StepMachineContext;
    };

export type StepMachineStateSchema = StateSchema<StepMachineContext>;

export type StepMachineRef = Interpreter<
  StepMachineContext,
  StepMachineStateSchema,
  StepMachineEvent,
  StepMachineState
>;

export interface StepQuestion {
  stepType: 'question';
  id: string;
  questionID: string;
  isVisible: boolean;
  isRequired: boolean;
  onCompleteConditionalActions: ConditionalActions[] | null;
  prePopulatedResponse?: PrePopulatedResponse;
  questionType?: QuestionType;
  ref?: QuestionMachineRef;
}

export interface StepText {
  stepType: 'text';
  id: string;
  isVisible: boolean;
  ref?: TextStepMachineRef;
}
