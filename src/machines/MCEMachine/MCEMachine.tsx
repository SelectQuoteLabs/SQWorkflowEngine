import {
  createMachine,
  assign,
  spawn,
  DoneInvokeEvent,
  StateMachine,
  actions,
} from 'xstate';
import { useQueryClient } from 'react-query';

import { Workflow } from 'types/workflow';
import { GroupStep, QuestionStep, TextStep, StepTypes } from 'types/steps';
import { ActionTypes, NextStepAction } from 'types/actions';
import { Application } from 'types/application';
import {
  ChildStep,
  MCEMachineContext,
  MCEMachineEvent,
  MCEMachineState,
  MCEStateSchema,
  MCEStep,
} from './MCEMachineTypes';
import { fetchApplication, fetchWorkflow } from 'utils/api';
import { NarrowEvent } from 'machines/utils';
import { useStepMachine } from 'machines/stepMachine';
import { QuestionTypes } from 'types/questions';

const useMCEMachine = (): StateMachine<
  MCEMachineContext,
  MCEStateSchema,
  MCEMachineEvent,
  MCEMachineState
> => {
  const queryClient = useQueryClient();
  const stepMachine = useStepMachine();

  const MCEMachine = createMachine<
    MCEMachineContext,
    MCEMachineEvent,
    MCEMachineState
  >(
    {
      id: 'MCEMachine',
      initial: 'fetchingApplication',
      context: {
        applicationKey: '',
        application: undefined,
        steps: [],
        nextStepID: '',
        currentStepID: '',
        knockout: { isKnockout: false, questionID: '' },
        globalLoadingMessage: '',
        successMessage: '',
        error: {
          errorData: null,
          message: '',
        },
      },
      on: {
        SET_GLOBAL_LOADING_MESSAGE: {
          actions: [
            assign({
              globalLoadingMessage: (_context, event) => event.message,
            }),
          ],
        },
        SET_SUCCESS_MESSAGE: {
          actions: [
            assign({
              successMessage: (_context, event) => event.message,
            }),
          ],
        },
        SET_ERROR: {
          actions: [
            assign({
              error: (_context, event) => {
                const { error } = event;
                return { errorData: error.errorData, message: error.message };
              },
            }),
          ],
        },
      },
      states: {
        fetchingApplication: {
          id: 'fetchingApplication',
          entry: [
            'setApplicationKey',
            actions.send({
              type: 'SET_GLOBAL_LOADING_MESSAGE',
              message: 'Loading Enrollment',
            }),
          ],
          invoke: {
            src: 'fetchApplication',
            onDone: {
              target: 'fetchingWorkflow',
              actions: ['setApplicationData'],
            },
            onError: {
              actions: [
                'clearGlobalLoadingMessage',
                assign<MCEMachineContext, DoneInvokeEvent<Error>>({
                  error: (_context, event) => {
                    const { data } = event;
                    return { errorData: data, message: data.message };
                  },
                }),
              ],
            },
          },
        },
        fetchingWorkflow: {
          id: 'fetchingWorkflow',
          invoke: {
            src: 'fetchWorkflow',
            onDone: {
              target: 'initialized.idle',
              actions: [
                'setStepsData',
                'spawnAllSteps',
                'clearGlobalLoadingMessage',
                actions.send({
                  type: 'SET_SUCCESS_MESSAGE',
                  message: 'Enrollment successfully loaded',
                }),
              ],
            },
            onError: {
              actions: [
                'clearGlobalLoadingMessage',
                assign<MCEMachineContext, DoneInvokeEvent<Error>>({
                  error: (_context, event) => {
                    const { data } = event;
                    return { errorData: data, message: data.message };
                  },
                }),
              ],
            },
          },
        },
        initialized: {
          id: 'initialized',
          initial: 'idle',
          states: {
            idle: {
              id: 'idle',
              on: {
                RECEIVE_UPDATE_FROM_CHILD: {
                  actions: ['updateStepFromChild'],
                },
                GO_TO_STEP: {
                  actions: ['setCurrentStep'],
                },
                REFETCH_WORKFLOW: {
                  target: '#fetchingWorkflow',
                },
                CLEAR_GLOBAL_LOADING_MESSAGE: {
                  actions: ['clearGlobalLoadingMessage'],
                },
              },
            },
          },
        },
      },
    },
    {
      services: {
        /** Uses the applicationKey stored in context to fetch the application data. */
        fetchApplication: (context) => {
          const { applicationKey } = context;
          return queryClient.fetchQuery(
            ['applicationData', { applicationKey }],
            () => fetchApplication(applicationKey ?? ''),
          );
        },
        /** Gets the `application` data from context and uses it's `applicationKey` and `workflowId` properties to fetch the workflow data. */
        fetchWorkflow: (context) => {
          const { application } = context;
          if (!application) {
            throw new Error('Application data is undefined');
          }
          return queryClient.fetchQuery(
            ['workflowData', { applicationKey: application.applicationKey }],
            () =>
              fetchWorkflow({
                applicationKey: application.applicationKey,
                workflowID: application.workflowId,
              }),
          );
        },
      },
      actions: {
        clearGlobalLoadingMessage: assign<MCEMachineContext, MCEMachineEvent>({
          globalLoadingMessage: '',
        }),
        /** Gets the `applicationKey` from the URL and assigns it to `applicationKey` in context. */
        setApplicationKey: assign<MCEMachineContext, MCEMachineEvent>(
          (context) => {
            const params = new URLSearchParams(window.location.search);
            const applicationKey = params.get('applicationKey');
            return {
              applicationKey,
              error: {
                ...context.error,
                message: applicationKey ? '' : 'Missing applicationKey in URL',
              },
            };
          },
        ),
        /** Assigns the data returned from the invoked fetchApplication promise to the `application` property in context. */
        setApplicationData: assign({
          application: (_context, event: DoneInvokeEvent<Application>) =>
            event.data,
        }) as any,
        /**
         * Using the data returned from the invoked fetchWorkflow promise, create a steps array that includes all of the data needed for each
         * child step machine and assign it to the `steps` property in context. Also sets up the first step machine to be created by assigning
         * the `firstStepID` from the workflow data to the `currentStepID` property in context.
         */
        setStepsData: assign((_context, event: DoneInvokeEvent<Workflow>) => {
          const { steps, firstStepId: firstStepID } = event.data;
          const stepsArray = buildStepsArray(steps);

          return {
            steps: stepsArray,
            currentStepID: firstStepID,
          };
        }) as any,
        spawnAllSteps: assign((context) => {
          const { steps, applicationKey, application } = context;
          return {
            steps: steps.map((step) => {
              return {
                /**
                 * Assigns to the `steps` property a copy of `steps` with the addition of a new spawned stepMachine `ref` for each step. This new
                 * step machine is initialized with all of the data it needs by utilizing `withContext`.
                 */
                ...step,
                ref: spawn(
                  stepMachine.withContext({
                    stepID: step.stepID,
                    nextStepID: step.nextStepID,
                    childSteps: step.childSteps,
                    applicationKey,
                    workflowID: application?.workflowId ?? '',
                    hasPassWorkflow: step.hasPassWorkflow,
                    wasSubmitted: false,
                    confirmationID: application?.confirmationId ?? '',
                  }),
                  step.stepName,
                ) as MCEStep['ref'],
              };
            }),
          };
        }),
        /**
         * When a child step machine needs to update this machine with some new data it will use the 'RECEIVE_UPDATE_FROM_CHILD' event to do so.
         * Currently this event is specifically set up to allow a `stepSummary` and `stepID` to be sent along with it, but any data could
         * potentially be included in the payload.
         */
        updateStepFromChild: assign<
          MCEMachineContext,
          NarrowEvent<MCEMachineEvent, 'RECEIVE_UPDATE_FROM_CHILD'>
        >((context, event) => {
          const { stepSummary, stepID } = event.payload;

          return {
            ...event.payload,
            // Using the `stepID`, add the `stepSummary` to the corresponding step data in the `steps` array.
            steps: context.steps.map((step) => {
              return step.stepID === stepID ? { ...step, stepSummary } : step;
            }),
          };
        }) as any,
        /** Assigns the `currentStepID` to the `stepID` that was sent along with the event */
        setCurrentStep: assign<
          MCEMachineContext,
          NarrowEvent<MCEMachineEvent, 'GO_TO_STEP'>
        >({
          currentStepID: (_context, event) => {
            return event.stepID;
          },
        }) as any,
      },
    },
  );

  return MCEMachine;
};

export default useMCEMachine;

type StepsArray = Pick<
  MCEStep,
  'stepID' | 'stepName' | 'nextStepID' | 'childSteps' | 'hasPassWorkflow'
>[];

/** Takes the `steps` array from the workflow data and builds a new steps array that only includes the data we need to spawn each step's machine. */
const buildStepsArray = (stepsArray: GroupStep[]): StepsArray =>
  stepsArray.reduce((acc: StepsArray, step) => {
    const {
      headerText: stepName,
      id: stepID,
      subSteps,
      onCompleteConditionalActions,
    } = step;

    /** Sets up the child question and text subSteps that are within each step */
    const childSteps = subSteps
      .filter(
        (step): step is QuestionStep | TextStep =>
          step.stepType === StepTypes.QUESTION ||
          step.stepType === StepTypes.TEXT,
      )
      .reduce((acc: ChildStep[], step) => {
        const { id, isVisible, onCompleteConditionalActions } = step;
        if (step.stepType === StepTypes.QUESTION) {
          const { isRequired } = step;
          const {
            question: { id: questionID, prePopulatedResponse, questionType },
          } = step;
          const dataSource =
            step.question.questionType === QuestionTypes.MULTIPLECHOICE
              ? step.question.dataSource
              : null;
          const options =
            step.question.questionType === QuestionTypes.MULTIPLECHOICE
              ? step.question.values
              : null;

          acc.push({
            stepType: step.stepType,
            id,
            questionID,
            isVisible,
            isRequired,
            onCompleteConditionalActions,
            prePopulatedResponse,
            questionType,
            dataSource,
            options,
          });
        } else if (step.stepType === StepTypes.TEXT) {
          acc.push({
            stepType: step.stepType,
            id,
            isVisible,
          });
        }
        return acc;
      }, []);

    /** The `nextStepID` for each step is based on its 'nextStep' conditional action in the workflow data */
    const nextStepID =
      onCompleteConditionalActions?.reduce((_acc, current) => {
        const { stepId } =
          (current.actions.find(
            (action) => action.actionType === 'nextStep',
          ) as NextStepAction) ?? {};
        return stepId;
      }, '') ?? '';

    /** The `hasPassWorkflow` indicates if the step is the Summary step */
    const hasPassWorkflow = onCompleteConditionalActions?.some((item) =>
      item.actions.find(
        (action) => action.actionType === ActionTypes.PASSWORKFLOW,
      ),
    );

    acc.push({ stepName, stepID, nextStepID, childSteps, hasPassWorkflow });
    return acc;
  }, []);
