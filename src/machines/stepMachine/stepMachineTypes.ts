import { StateSchema, Interpreter } from 'xstate';

import { ConditionalActions } from 'types/evaluations';
import {
  Action,
  UpdateStepIsRequiredAction,
  UpdateStepVisibilityAction,
} from 'types/actions';
import {
  DataSource,
  MultipleChoiceOptionValue,
  PrePopulatedResponse,
  QuestionType,
} from 'types/questions';
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
  parentUpdated?: boolean;
  hasPassWorkflow?: boolean;
  stepSummary?: StepSummary;
  knockout?: Knockout;
  questionActionsQueue?: ActionsQueueItem[];
  wasSubmitted: boolean;
  confirmationID: string;
  dataSources?: {
    dependencies: string[];
    items: DataSourceItem[];
  };
  dataSourcesQueue?: DataSourceItem[];
  currentDataSource?: DataSourceItem | null;
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
  | { type: 'RECEIVE_VALUE_UPDATE'; questionID: string; value: string }
  | {
      type: 'RECEIVE_QUESTION_UPDATE';
      payload: {
        actionsQueue: ActionsQueueItem[];
        isKnockout: boolean;
        questionID: string;
      };
    }
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
    }
  | {
      type: 'CHECK_DATA_SOURCES_QUEUE';
    };

export type StepMachineState =
  | {
      value: 'initializing';
      context: StepMachineContext;
    }
  | {
      value: 'initialized';
      context: StepMachineContext;
    }
  | {
      value:
        | { initialized: 'form' }
        | { initialized: { form: 'idle' } }
        | { initialized: { form: 'submitting' } }
        | { initialized: { form: { submitting: 'checkingSubmittedValues' } } }
        | { initialized: { form: { submitting: 'sendingWorkflowResponses' } } }
        | { initialized: { form: { submitting: 'submittingApplication' } } }
        | { initialized: { form: 'cancelled' } }
        | { initialized: 'dataSources' }
        | { initialized: { dataSources: 'initializing' } }
        | { initialized: { dataSources: 'idle' } }
        | { initialized: { dataSources: 'checkingDataSourcesQueue' } }
        | { initialized: { dataSources: 'fetchingDataSource' } }
        | { initialized: 'conditionalActions' }
        | { initialized: { conditionalActions: 'checkingActionsQueue' } }
        | { initialized: { conditionalActions: 'idle' } }
        | { initialized: { conditionalActions: 'updatingChildStepVisibility' } }
        | { initialized: { conditionalActions: 'updatingChildStepRequired' } };
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
  dataSource: DataSource | null;
  options: MultipleChoiceOptionValue[] | null;
}

export interface StepText {
  stepType: 'text';
  id: string;
  isVisible: boolean;
  ref?: TextStepMachineRef;
}

export interface DataSourceItem {
  questionID: string;
  originID: string;
  dataSource: DataSource;
}
