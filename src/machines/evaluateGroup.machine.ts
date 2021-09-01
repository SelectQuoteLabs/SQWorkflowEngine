import { ContextFrom, EventFrom } from 'xstate';
import { createModel } from 'xstate/lib/model';
import { choose, pure, send } from 'xstate/lib/actions';

import { GroupConditional } from 'types/evaluations';
import { QuestionMachineRef } from './question/question.types';
import {
  evaluateComparison,
  evaluationOperatorMap,
  ExtractModelEvent,
} from './utils';
import { questionModel } from './question/question.machine';

type EvaluateGroupContext = ContextFrom<typeof evaluateGroupModel>;
type EvaluateGroupEvent = EventFrom<typeof evaluateGroupModel>;

const States = {
  collectingValues: 'collectingValues',
  evaluating: 'evaluating',
  final: 'final',
} as const;

export const evaluateGroupModel = createModel(
  {
    parentQuestionID: '',
    parentValue: '',
    groupConditional: {} as GroupConditional,
    refs: [] as QuestionMachineRef[],
    collectedValues: {} as Record<string, string>,
    responsesNeeded: 0,
    groupEvaluation: false,
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

export const evaluateGroupMachine = evaluateGroupModel.createMachine(
  {
    id: 'evaluateGroupMachine',
    context: evaluateGroupModel.initialContext,
    initial: States.collectingValues,
    entry: ['initializeContextValues', 'injectParentValue'],
    states: {
      [States.collectingValues]: {
        entry: ['requestAllValues'],
        on: {
          PONG_VALUE: {
            actions: ['assignCollectedValue'],
          },
        },
        always: {
          target: States.evaluating,
          cond: 'hasAllResponses',
        },
      },
      [States.evaluating]: {
        entry: ['evaluateGroupConditional'],
        always: { target: States.final },
      },
      [States.final]: {
        type: 'final',
        data: {
          evaluatedGroup: (context: EvaluateGroupContext) => ({
            evaluationResult: context.groupEvaluation,
            actions: context.groupConditional.actions,
          }),
        },
      },
    },
  },
  {
    actions: {
      initializeContextValues: evaluateGroupModel.assign({
        responsesNeeded: (context) => context.refs.length,
        collectedValues: (context) => {
          return Object.fromEntries(
            context.groupConditional.evaluation.evaluations.map(
              (evaluation) => [evaluation.questionId, ''],
            ),
          );
        },
      }),
      injectParentValue: choose([
        {
          cond: (context): boolean =>
            Object.keys(context.collectedValues).includes(
              context.parentQuestionID,
            ),
          actions: [
            evaluateGroupModel.assign({
              collectedValues: (context) => ({
                ...context.collectedValues,
                [context.parentQuestionID]: context.parentValue,
              }),
            }),
          ],
        },
      ]),
      requestAllValues: pure((context, _event) => {
        return context.refs.map((ref) => {
          return send<
            EvaluateGroupContext,
            EvaluateGroupEvent,
            ExtractModelEvent<typeof questionModel, 'PING_VALUE'>
          >(
            { type: 'PING_VALUE' },
            {
              to: () => ref,
            },
          );
        });
      }),
      assignCollectedValue: evaluateGroupModel.assign({
        collectedValues: (context, event) => {
          return {
            ...context.collectedValues,
            [event.fromQuestionID]: event.value,
          };
        },
        responsesNeeded: (context) => context.responsesNeeded - 1,
      }),
      evaluateGroupConditional: evaluateGroupModel.assign({
        groupEvaluation: (context) => {
          const { groupConditional, collectedValues } = context;
          const {
            evaluation: { evaluations: evaluationsArray, logicalOperator },
          } = groupConditional;

          const allEvaluatedComparisons = evaluationsArray.map((evaluation) => {
            const { questionId, comparison } = evaluation;
            const value = collectedValues[questionId];

            const hasPassedEvaluation = value
              ? evaluateComparison(value, comparison)
              : false;

            return hasPassedEvaluation;
          });

          return evaluationOperatorMap[logicalOperator](
            allEvaluatedComparisons,
          );
        },
      }),
    },
    guards: {
      hasAllResponses: (context) => context.responsesNeeded === 0,
    },
  },
);
