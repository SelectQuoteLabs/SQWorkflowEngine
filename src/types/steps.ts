import { ConditionalActions } from './evaluations';
import { Question } from './questions';
import { UnionFromKeys } from './utils';

export const StepTypes = {
  QUESTION: 'question',
  TEXT: 'text',
  GROUP: 'group',
  SUMMARY: 'summary',
} as const;
export type StepType = UnionFromKeys<typeof StepTypes>;

interface StepBase<Type extends StepType> {
  id: string;
  stepType: Type;
  onCompleteConditionalActions: ConditionalActions[] | null;
}

export interface QuestionStep extends StepBase<'question'> {
  headerText: string;
  labelText: string;
  isRequired: boolean;
  displayText: string;
  isVisible: boolean;
  question: Question;
}

export interface TextStep extends StepBase<'text'> {
  headerText: string;
  displayText: string;
  isVisible: boolean;
}

export interface SummaryStep extends StepBase<'summary'> {
  headerText: string;
  isVisible: boolean;
  stepIds: string[];
}

export interface GroupStep extends StepBase<'group'> {
  headerText: string;
  labelText: string;
  displayText: string;
  isVisible: boolean;
  subSteps: Step[];
}

export type Step = QuestionStep | TextStep | SummaryStep | GroupStep;
