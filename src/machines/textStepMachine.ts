import { createMachine, Interpreter, StateSchema } from 'xstate';

export const textStepMachine = createMachine<
  TextStepMachineContext,
  TextStepMachineEvent,
  TextStepMachineState
>(
  {
    id: 'textStep',
    initial: 'initializing',
    context: {
      id: '',
      initialVisibility: true,
    },
    states: {
      initializing: {
        id: 'initializing',
        always: [
          {
            target: 'visible',
            cond: 'isInitiallyVisible',
          },
          { target: 'invisible' },
        ],
      },
      visible: {
        id: 'visible',
        on: {
          HIDE: {
            target: 'invisible',
          },
        },
      },
      invisible: {
        id: 'invisible',
        on: {
          SHOW: {
            target: 'visible',
          },
        },
      },
    },
  },
  {
    guards: {
      isInitiallyVisible: (context) => context.initialVisibility,
    },
  }
);

interface TextStepMachineContext {
  id: string;
  initialVisibility: boolean;
}

type TextStepMachineEvent = { type: 'HIDE' } | { type: 'SHOW' };

type TextStepMachineState =
  | { value: 'initializing'; context: TextStepMachineContext }
  | { value: 'visible'; context: TextStepMachineContext }
  | { value: 'invisible'; context: TextStepMachineContext };

type TextStepMachineStateSchema = StateSchema<TextStepMachineContext>;

export type TextStepMachineRef = Interpreter<
  TextStepMachineContext,
  TextStepMachineStateSchema,
  TextStepMachineEvent,
  TextStepMachineState
>;
