import { ActorRefFrom } from 'xstate';
import { createModel } from 'xstate/lib/model';

const textStepModel = createModel(
  {
    id: '',
    initialVisibility: false,
  },
  {
    events: {
      HIDE: () => ({}),
      SHOW: () => ({}),
    },
  },
);

export const textStepMachine = textStepModel.createMachine(
  {
    id: 'textStep',
    initial: 'initializing',
    context: textStepModel.initialContext,
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
  },
);

export type TextStepMachineRef = ActorRefFrom<typeof textStepMachine>;
