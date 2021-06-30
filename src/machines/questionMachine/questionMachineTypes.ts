import { Interpreter, StateSchema } from 'xstate';
import { Moment } from 'moment';

import { Action } from 'types/actions';
import { ConditionalActions } from 'types/evaluations';
import { MultipleChoiceOptionValue } from 'types/questions';

export interface QuestionMachineContext {
  id: string;
  questionID: string;
  initialVisibility: boolean;
  initialRequired: boolean;
  onCompleteConditionalActions: ConditionalActions[] | null;
  initialValue: string;
  value?: QuestionValue;
  actionsQueue?: ActionsQueueItem[];
  isKnockout?: boolean;
  knockoutMessage?: string | null;
  options: MultipleChoiceOptionValue[] | null;
}

export type QuestionValue = string | Moment;

export type QuestionMachineEvent =
  | {
      type: 'PARSE_CONDITIONAL_ACTIONS';
    }
  | {
      type: 'UPDATE_VALUE';
      value: string | Moment;
    }
  | {
      type: 'UPDATE_PARENT_WITH_VALUE';
    }
  | {
      type: 'UPDATE_OPTIONS';
      options: MultipleChoiceOptionValue[] | null;
    }
  | { type: 'EVALUATE_COMPARISON' }
  | { type: 'HIDE' }
  | { type: 'SHOW' }
  | { type: 'NOT_REQUIRED' }
  | { type: 'REQUIRED' };

export type QuestionMachineState =
  | {
      value: 'initializing';
      context: QuestionMachineContext;
    }
  | {
      value: 'initialized';
      context: QuestionMachineContext;
    }
  | {
      value:
        | { initialized: 'visibility' }
        | { initialized: { visibility: 'invisible' } }
        | { initialized: { visibility: 'visible' } }
        | { initialized: { visibility: { visible: 'idle' } } }
        | { initialized: { visibility: { visible: 'checkingInitialValues' } } }
        | {
            initialized: {
              visibility: { visible: 'evaluatingConditionalActions' };
            };
          }
        | {
            initialized: {
              visibility: { visible: 'performingActions' };
            };
          }
        | {
            initialized: {
              visibility: {
                visible: { performingActions: 'checkingActionsQueue' };
              };
            };
          }
        | {
            initialized: {
              visibility: {
                visible: { performingActions: 'settingKnockout' };
              };
            };
          }
        | {
            initialized: {
              visibility: {
                visible: { performingActions: 'updatingParent' };
              };
            };
          }
        | {
            initialized: {
              visibility: {
                visible: { performingActions: 'complete' };
              };
            };
          };
      context: QuestionMachineContext;
    }
  | {
      value:
        | { initialized: 'require' }
        | { initialized: { require: 'required' } }
        | { initialized: { require: 'notRequired' } };
      context: QuestionMachineContext;
    };

export type QuestionMachineStateSchema = StateSchema<QuestionMachineContext>;

export type QuestionMachineRef = Interpreter<
  QuestionMachineContext,
  QuestionMachineStateSchema,
  QuestionMachineEvent,
  QuestionMachineState
>;

export interface ActionsQueueItem {
  evaluationResult: boolean;
  actions: Action[];
}
