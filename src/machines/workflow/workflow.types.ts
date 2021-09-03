import { ContextFrom, EventFrom } from 'xstate';

import {
  StepQuestion,
  StepText,
  StepMachineRef,
} from '../step/step.types';
import { ExtractModelEvent } from '../utils';
import { workflowModel } from './workflow.machine';

export type WorkflowContext = ContextFrom<typeof workflowModel>;
type WorkflowEvent = EventFrom<typeof workflowModel>;
export type ExtractWorkflowEvent<Type extends WorkflowEvent['type']> =
  ExtractModelEvent<typeof workflowModel, Type>;

export interface QuestionDetails {
  questionID: string;
  question: string | undefined;
  answer: string;
}

export type StepSummary = QuestionDetails[];

export type ChildStep = StepQuestion | StepText;

export interface WorkflowStep {
  stepID: string;
  stepName: string;
  nextStepID: string;
  childSteps: ChildStep[];
  ref?: StepMachineRef;
  stepSummary?: StepSummary;
  hasPassWorkflow: boolean;
}
