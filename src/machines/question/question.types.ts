import { ActorRefFrom } from 'xstate';

import { Action } from '../../types/actions';
import questionMachine from './question.machine';

export type QuestionMachineRef = ActorRefFrom<typeof questionMachine>;

export interface ActionsQueueItem {
  evaluationResult: boolean;
  actions: Action[];
}
