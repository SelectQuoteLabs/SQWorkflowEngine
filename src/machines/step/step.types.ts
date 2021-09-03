import { ActorRefFrom, ContextFrom, EventFrom } from 'xstate';

import { ConditionalAction } from '../../types/evaluations';
import {
  DataSource,
  MultipleChoiceOptionValue,
  PrePopulatedResponse,
  QuestionType,
} from '../../types/questions';
import { QuestionMachineRef } from '../question/question.types';
import { TextStepMachineRef } from '../textStep.machine';
import stepMachine, { stepModel } from './step.machine';
import { ExtractModelEvent } from '../utils';

export type StepMachineRef = ActorRefFrom<typeof stepMachine>;

export type StepContext = ContextFrom<typeof stepModel>;
export type StepEvent = EventFrom<typeof stepModel>;
export type ExtractStepEvent<Type extends StepEvent['type']> =
  ExtractModelEvent<typeof stepModel, Type>;

export interface StepQuestion {
  stepType: 'question';
  id: string;
  questionID: string;
  isVisible: boolean;
  isRequired: boolean;
  onCompleteConditionalActions: ConditionalAction[] | null;
  prePopulatedResponse?: PrePopulatedResponse;
  questionType: QuestionType;
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

export interface Knockout {
  isKnockout: boolean;
  questionID: string;
}
