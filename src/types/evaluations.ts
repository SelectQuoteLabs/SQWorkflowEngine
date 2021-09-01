import { Action } from './actions';
import { Comparison } from './comparisons';
import { UnionFromKeys } from './utils';

export const EvaluationTypes = {
  GROUP: 'group',
  QUESTION: 'question',
  AUTOMATIC: 'automatic',
  ALWAYSTRUE: 'alwaysTrue',
} as const;
type EvaluationType = UnionFromKeys<typeof EvaluationTypes>;

export const LogicalOperators = {
  AND: 'and',
  OR: 'or',
} as const;
type LogicalOperator = UnionFromKeys<typeof LogicalOperators>;

export interface ConditionalAction {
  evaluation: Evaluation;
  actions: Action[];
}

export type QuestionConditional = Omit<ConditionalAction, 'evaluation'> & {
  evaluation: QuestionEvaluation;
};
export type GroupConditional = Omit<ConditionalAction, 'evaluation'> & {
  evaluation: GroupEvaluation;
};
export type AlwaysTrueConditional = Omit<ConditionalAction, 'evaluation'> & {
  evaluation: AutomaticEvaluation;
};

interface EvaluationBase<Type extends EvaluationType> {
  evaluationType: Type;
}

interface GroupEvaluation extends EvaluationBase<'group'> {
  logicalOperator: LogicalOperator;
  evaluations: QuestionEvaluation[];
}

interface QuestionEvaluation extends EvaluationBase<'question'> {
  questionId: string;
  comparison: Comparison;
}

interface AutomaticEvaluation extends EvaluationBase<'alwaysTrue'> {
  evaluationValue: boolean;
}

export type Evaluation =
  | GroupEvaluation
  | QuestionEvaluation
  | AutomaticEvaluation;
