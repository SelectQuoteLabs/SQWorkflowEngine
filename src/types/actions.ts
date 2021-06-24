import { UnionFromKeys } from './utils';

export const ActionTypes = {
  PASSWORKFLOW: 'passWorkflow',
  FAILWORKFLOW: 'failWorkflow',
  NEXTSTEP: 'nextStep',
  UPDATESTEPVISIBILITY: 'updateStepVisibility',
  UPDATESTEPISREQUIRED: 'updateStepIsRequired',
} as const;
export type ActionType = UnionFromKeys<typeof ActionTypes>;

export interface ActionBase<Type extends ActionType> {
  actionType: Type;
}

interface PassWorkflowAction extends ActionBase<'passWorkflow'> {
  headerText: string;
  displayText: string;
}

export interface FailWorkflowAction extends ActionBase<'failWorkflow'> {
  headerText: string;
  displayText: string;
}

export interface UpdateStepVisibilityAction
  extends ActionBase<'updateStepVisibility'> {
  stepId: string;
  isVisible: boolean;
}

export interface UpdateStepIsRequiredAction
  extends ActionBase<'updateStepIsRequired'> {
  stepId: string;
  isRequired: boolean;
}

export interface NextStepAction extends ActionBase<'nextStep'> {
  stepId: string;
}

export type Action =
  | PassWorkflowAction
  | FailWorkflowAction
  | UpdateStepVisibilityAction
  | UpdateStepIsRequiredAction
  | NextStepAction;
