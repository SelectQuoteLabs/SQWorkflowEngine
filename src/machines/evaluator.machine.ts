import { ActorRefFrom, ContextFrom, DoneInvokeEvent } from 'xstate';
import { createModel } from 'xstate/lib/model';
import { assign } from 'xstate/lib/actions';

import {
  ConditionalAction,
  EvaluationTypes,
  GroupConditional,
  QuestionConditional,
  AlwaysTrueConditional,
} from '../types/evaluations';
import { Action } from '../types/actions';
import questionMachine from './question';
import { evaluateComparison } from './utils';
import {
  evaluateGroupMachine,
  evaluateGroupModel,
} from './evaluateGroup.machine';

const States = {
  evaluatingAllConditionals: 'evaluatingAllConditionals',
  questionConditionals: 'questionConditionals',
  groupConditionals: 'groupConditionals',
  checkingForGroupConditionals: 'checkingForGroupConditionals',
  alwaysTrueConditionals: 'alwaysTrueConditionals',
  evaluating: 'evaluating',
  done: 'done',
  final: 'final',
} as const;

export type EvaluatedConditional = {
  evaluationResult: boolean;
  actions: Action[];
};

type EvaluatorContext = ContextFrom<typeof evaluatorModel>;

export const evaluatorModel = createModel({
  parentQuestionID: '',
  parentValue: '',
  refs: [] as ActorRefFrom<typeof questionMachine>[],
  parentConditionalActions: [] as ConditionalAction[],
  returnActions: [] as EvaluatedConditional[],
  questionConditionals: [] as QuestionConditional[],
  groupConditionals: [] as GroupConditional[],
  alwaysTrueConditionals: [] as AlwaysTrueConditional[],
});

export const evaluatorMachine = evaluatorModel.createMachine(
  {
    id: 'evaluatorMachine',
    initial: States.evaluatingAllConditionals,
    entry: ['divideConditionals'],
    states: {
      [States.evaluatingAllConditionals]: {
        type: 'parallel',
        states: {
          [States.questionConditionals]: {
            initial: States.evaluating,
            states: {
              [States.evaluating]: {
                entry: ['assignQuestionConditionalEvaluations'],
                always: { target: States.done },
              },
              [States.done]: { type: 'final' },
            },
          },
          [States.groupConditionals]: {
            initial: States.checkingForGroupConditionals,
            states: {
              [States.checkingForGroupConditionals]: {
                always: [
                  {
                    target: States.evaluating,
                    cond: 'hasGroupConditionals',
                  },
                  {
                    target: States.done,
                  },
                ],
              },
              [States.evaluating]: {
                invoke: {
                  src: evaluateGroupMachine,
                  data: (context) => {
                    const {
                      groupConditionals,
                      parentValue,
                      parentQuestionID,
                      refs,
                    } = context;
                    return {
                      ...evaluateGroupModel.initialContext,
                      parentQuestionID,
                      parentValue,
                      groupConditional: groupConditionals[0],
                      refs,
                    };
                  },
                  onDone: {
                    target: States.done,
                    actions: [
                      'assignGroupConditionalEvaluations',
                      assign({
                        returnActions: (
                          context,
                          event: DoneInvokeEvent<{
                            evaluatedGroup: EvaluatedConditional;
                          }>,
                        ) => [
                          ...context.returnActions,
                          event.data.evaluatedGroup,
                        ],
                      }),
                    ],
                  },
                },
              },
              [States.done]: { type: 'final' },
            },
          },
          [States.alwaysTrueConditionals]: {
            initial: States.evaluating,
            states: {
              evaluating: {
                entry: ['assignAlwaysTrueConditionalEvaluations'],
                always: { target: States.done },
              },
              [States.done]: { type: 'final' },
            },
          },
        },
        onDone: { target: States.final },
      },
      [States.final]: {
        type: 'final',
        data: {
          returnActions: (context: EvaluatorContext) => context.returnActions,
        },
      },
    },
  },
  {
    actions: {
      divideConditionals: evaluatorModel.assign({
        questionConditionals: (context) =>
          context.parentConditionalActions.filter(
            (conditional): conditional is QuestionConditional =>
              conditional.evaluation.evaluationType ===
              EvaluationTypes.QUESTION,
          ),
        groupConditionals: (context) =>
          context.parentConditionalActions.filter(
            (conditional): conditional is GroupConditional =>
              conditional.evaluation.evaluationType === EvaluationTypes.GROUP,
          ),
        alwaysTrueConditionals: (context) =>
          context.parentConditionalActions.filter(
            (conditional): conditional is AlwaysTrueConditional =>
              conditional.evaluation.evaluationType ===
              EvaluationTypes.ALWAYSTRUE,
          ),
      }),
      assignQuestionConditionalEvaluations: evaluatorModel.assign({
        returnActions: (context) => {
          const { parentValue, questionConditionals, returnActions } = context;

          const evaluatedConditionals = questionConditionals.map(
            (conditional) => {
              const { evaluation, actions } = conditional;

              const hasPassedEvaluation = parentValue
                ? evaluateComparison(parentValue, evaluation.comparison)
                : false;

              return {
                evaluationResult: hasPassedEvaluation,
                actions,
              };
            },
          );

          return [...returnActions, ...evaluatedConditionals];
        },
      }),
      assignAlwaysTrueConditionalEvaluations: evaluatorModel.assign({
        returnActions: (context) => {
          const { alwaysTrueConditionals } = context;

          const evaluatedConditionals = alwaysTrueConditionals.map(
            (conditional) => {
              const {
                evaluation: { evaluationValue },
                actions,
              } = conditional;

              return {
                evaluationResult: evaluationValue,
                actions,
              };
            },
          );

          return [...context.returnActions, ...evaluatedConditionals];
        },
      }),
    },
    guards: {
      hasQuestionConditionals: (context): boolean =>
        Boolean(context.questionConditionals.length),
      hasGroupConditionals: (context): boolean =>
        Boolean(context.groupConditionals.length),
    },
  },
);
