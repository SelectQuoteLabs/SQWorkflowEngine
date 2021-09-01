import { send, StateFrom } from 'xstate';
import { createModel } from 'xstate/lib/model';
import { useSelector } from '@xstate/react';

import { useStatusService } from 'contexts/GlobalServices';
import { createSelector } from './utils';

type StatusContext = {
  globalLoadingMessage: string;
  successMessage: string;
  errorMessage: string;
};

export const statusModel = createModel(
  {
    globalLoadingMessage: '',
    successMessage: '',
    errorMessage: '',
  } as StatusContext,
  {
    events: {
      SET_GLOBAL_LOADING_MESSAGE: (message: string) => ({ message }),
      SET_TOAST_MESSAGE: (
        toastType: keyof Pick<StatusContext, 'successMessage' | 'errorMessage'>,
        message: string,
      ) => ({ toastType, message }),
      RESET_TOAST_MESSAGE: (
        toastType: keyof Pick<StatusContext, 'successMessage' | 'errorMessage'>,
      ) => ({ toastType }),
    },
  },
);

export const statusMachine = statusModel.createMachine({
  id: 'status',
  context: statusModel.initialContext,
  initial: 'idle',
  states: {
    idle: {
      on: {
        SET_GLOBAL_LOADING_MESSAGE: {
          actions: statusModel.assign({
            globalLoadingMessage: (_context, event) => event.message,
          }),
        },
        SET_TOAST_MESSAGE: {
          actions: [
            statusModel.assign((_context, event) => ({
              [event.toastType]: event.message,
            })),
            send(
              (_context, event) => ({
                type: 'RESET_TOAST_MESSAGE',
                toastType: event.toastType,
              }),
              { delay: 3000 },
            ),
          ],
        },
        RESET_TOAST_MESSAGE: {
          actions: statusModel.assign((_context, event) => ({
            [event.toastType]: '',
          })),
        },
      },
    },
  },
});

export const useStatusSelector = <Type extends unknown>(
  selector: (state: StateFrom<typeof statusMachine>) => Type,
): Type => {
  const service = useStatusService();
  return useSelector(service, selector);
};

const createStatusSelector = createSelector<typeof statusMachine>();

export const getGlobalLoadingMessage = createStatusSelector(
  (state) => state.context.globalLoadingMessage,
);

export const getSuccessMessage = createStatusSelector(
  (state) => state.context.successMessage,
);

export const getErrorMessage = createStatusSelector(
  (state) => state.context.errorMessage,
);

export const useStatusDispatch = (): {
  setGlobalLoadingMessage: (message: string) => void;
  setSuccessMessage: (message: string) => void;
  setErrorMessage: (message: string) => void;
} => {
  const statusService = useStatusService();

  const setGlobalLoadingMessage = (message: string): void =>
    statusService.send({
      type: 'SET_GLOBAL_LOADING_MESSAGE',
      message,
    });
  const setSuccessMessage = (message: string): void =>
    statusService.send({
      type: 'SET_TOAST_MESSAGE',
      toastType: 'successMessage',
      message,
    });
  const setErrorMessage = (message: string): void =>
    statusService.send({
      type: 'SET_TOAST_MESSAGE',
      toastType: 'errorMessage',
      message,
    });

  return { setGlobalLoadingMessage, setSuccessMessage, setErrorMessage };
};
