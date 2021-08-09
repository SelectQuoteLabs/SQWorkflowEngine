import { ActorRefFrom } from 'xstate';

import { ConditionalActions } from '../../types/evaluations';
import {
  DataSource,
  MultipleChoiceOptionValue,
  PrePopulatedResponse,
  QuestionType,
} from '../../types/questions';
import { QuestionMachineRef } from '../question/question.types';
import { TextStepMachineRef } from '../textStep.machine';
import stepMachine from './step.machine';

export type StepMachineRef = ActorRefFrom<typeof stepMachine>;

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

export interface Knockout {
  isKnockout: boolean;
  questionID: string;
}
