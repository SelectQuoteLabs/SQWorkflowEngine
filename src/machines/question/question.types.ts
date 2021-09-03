import { ActorRefFrom, EventFrom, StateMachine, StateSchema } from 'xstate';

import { Action } from '../../types/actions';
import { ExtractModelEvent } from '../../machines/utils';
import { questionModel } from './question.machine';
import { ConditionalAction } from '../../types/evaluations';
import { DataSource, MultipleChoiceOptionValue } from '../../types/questions';

export type QuestionMachineRef = ActorRefFrom<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  StateMachine<QuestionContext, StateSchema<QuestionContext>, any>
>;

export type QuestionContext = {
  id: string;
  questionID: string;
  initialVisibility: boolean;
  initialRequired: boolean;
  onCompleteConditionalActions: ConditionalAction[] | null;
  initialValue: string;
  value: string;
  actionsQueue: ActionsQueueItem[];
  isKnockout: boolean;
  knockoutMessage: string | null;
  dataSource: DataSource | null;
  options: MultipleChoiceOptionValue[] | null;
  dataSourceDepValue: string;
  conditionalRefs: QuestionMachineRef[];
  dataSourceRefs: QuestionMachineRef[];
};
export type QuestionEvent = EventFrom<typeof questionModel>;
export type ExtractQuestionEvent<Type extends QuestionEvent['type']> =
  ExtractModelEvent<typeof questionModel, Type>;

export interface ActionsQueueItem {
  evaluationResult: boolean;
  actions: Action[];
}
