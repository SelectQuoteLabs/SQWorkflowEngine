import { ContextFrom, EventFrom } from 'xstate';
import { createModel } from 'xstate/lib/model';
import { pure, send } from 'xstate/lib/actions';

import { QuestionMachineRef } from './question/question.types';
import { ExtractModelEvent } from './utils';
import { questionModel } from './question/question.machine';

type SyncFormValuesContext = ContextFrom<typeof syncFormValuesModel>;
type SyncFormValuesEvent = EventFrom<typeof syncFormValuesModel>;

const States = {
  collectingValues: 'collectingValues',
  final: 'final',
} as const;

const syncFormValuesModel = createModel(
  {
    currentValues: {} as Record<string, string>,
    questionRefs: [] as QuestionMachineRef[],
    responsesNeeded: 0,
  },
  {
    events: {
      PONG_VALUE: (value: string, fromQuestionID: string) => ({
        value,
        fromQuestionID,
      }),
    },
  },
);

export const syncFormValuesMachine = syncFormValuesModel.createMachine(
  {
    id: 'syncFormValuesMachine',
    context: syncFormValuesModel.initialContext,
    entry: ['assignResponsesNeeded'],
    initial: States.collectingValues,
    states: {
      [States.collectingValues]: {
        entry: 'requestAllValues',
        on: {
          PONG_VALUE: {
            actions: ['assignCollectedValue'],
          },
        },
        always: {
          target: States.final,
          cond: 'hasAllResponses',
        },
      },
      [States.final]: {
        type: 'final',
        data: {
          returnValues: (context: SyncFormValuesContext) =>
            context.currentValues,
        },
      },
    },
  },
  {
    actions: {
      assignResponsesNeeded: syncFormValuesModel.assign({
        responsesNeeded: (context) => context.questionRefs.length,
      }),
      requestAllValues: pure((context, _event) => {
        return context.questionRefs.map((ref) => {
          return send<
            SyncFormValuesContext,
            SyncFormValuesEvent,
            ExtractModelEvent<typeof questionModel, 'PING_VALUE'>
          >(
            { type: 'PING_VALUE' },
            {
              to: () => ref,
            },
          );
        });
      }),
      assignCollectedValue: syncFormValuesModel.assign({
        currentValues: (context, event) => {
          return {
            ...context.currentValues,
            [event.fromQuestionID]: event.value,
          };
        },
        responsesNeeded: (context) => context.responsesNeeded - 1,
      }),
    },
    guards: {
      hasAllResponses: (context) => context.responsesNeeded === 0,
    },
  },
);
