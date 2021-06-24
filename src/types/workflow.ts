import { Moment } from 'moment';
import { ResponseDataType, ResponseSourceType } from './questions';
import { GroupStep } from './steps';

export interface Workflow {
  id: string;
  name: string;
  firstStepId: string;
  sortOrder: null;
  steps: GroupStep[];
}

export interface WorkflowResponsesBody {
  [index: string]: unknown;
  workflowId: string;
  questionStepResponses: {
    stepId: string;
    questionId: string;
    dataType: ResponseDataType;
    responseDate: string | Moment;
    responseValue: string;
    responseSource: ResponseSourceType;
  }[];
}
