import workflowMachine from './machines/workflow';
import { workflowModel } from 'machines/workflow/workflow.machine';
import stepMachine from './machines/step';
import { stepModel } from 'machines/step/step.machine';
import questionMachine from './machines/question';
import { questionModel } from 'machines/question/question.machine';
import { textStepMachine } from './machines/textStep.machine';
import { statusMachine, statusModel } from './machines/status.machine';

export {
  workflowMachine,
  workflowModel,
  stepMachine,
  stepModel,
  questionMachine,
  questionModel,
  textStepMachine,
  statusMachine,
  statusModel,
};
