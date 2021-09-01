import {
  ActorRefFrom,
  EventFrom,
  EventObject,
  StateMachine,
  StateSchema,
} from 'xstate';

import { Action } from 'types/actions';
import { ExtractModelEvent } from 'machines/utils';
import { questionModel } from './question.machine';
import { ConditionalAction } from 'types/evaluations';
import { DataSource, MultipleChoiceOptionValue } from 'types/questions';

export type QuestionMachineRef = ActorRefFrom<
  StateMachine<QuestionContext, StateSchema<QuestionContext>, EventObject>
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
