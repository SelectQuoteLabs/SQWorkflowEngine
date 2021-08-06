import {
  StepQuestion,
  StepText,
  StepMachineRef,
} from 'machines/stepMachine/stepMachineTypes';

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
