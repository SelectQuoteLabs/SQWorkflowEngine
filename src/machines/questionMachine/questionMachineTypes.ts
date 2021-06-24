import { Interpreter, StateSchema } from 'xstate';
import { Moment } from 'moment';

import { Action } from 'types/actions';
import { ConditionalActions } from 'types/evaluations';

export interface QuestionMachineContext {
  id: string;
  questionID: string;
  initialVisibility: boolean;
  initialRequired: boolean;
  onCompleteConditionalActions: ConditionalActions[] | null;
  initialValue: string;
  value?: string | Moment;
  actionsQueue?: ActionsQueueItem[];
  isKnockout?: boolean;
  knockoutMessage?: string | null;
}

export type QuestionMachineEvent =
  | {
      type: 'UPDATE_VALUE';
      value: string | Moment;
    }
  | { type: 'EVALUATE_COMPARISON' }
  | { type: 'UPDATE_PARENT' }
  | { type: 'SET_KNOCKOUT' }
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
