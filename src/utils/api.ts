import { useQuery, UseQueryResult, useQueryClient } from "react-query"

import { Workflow, WorkflowResponsesBody } from "../types/workflow"
import { Application } from "../types/application"
import { fetchWrapper } from "./fetchWrapper"
// import { useMCEService } from '../contexts/MCEService';

const baseUrl = process.env.REACT_APP_ENROLLMENT_API_URL
const workflowsBase = `${baseUrl}/api/workflows`
const applicationsBase = `${baseUrl}/api/Applications`

const EndpointTypes = {
	GET_WORKFLOW: "GET_WORKFLOW",
	GET_APPLICATION: "GET_APPLICATION",
	POST_RESPONSES: "POST_RESPONSES",
	SUBMIT_APPLICATION: "SUBMIT_APPLICATION",
	UPDATE_CUSTOMER_PHONE_NUMBER: "UPDATE_CUSTOMER_PHONE_NUMBER",
} as const

type EndpointGetter = (applicationKey: string, workflowID?: string) => string

const getEndpoint = (endpoint: string): EndpointGetter => {
	const endpointMap: { [index: string]: EndpointGetter } = {
		[EndpointTypes.GET_WORKFLOW]: (applicationKey, workflowID): string =>
			`${workflowsBase}/${workflowID}?applicationKey=${applicationKey}`,
		[EndpointTypes.GET_APPLICATION]: (applicationKey) =>
			`${applicationsBase}/${applicationKey}`,
		[EndpointTypes.POST_RESPONSES]: (applicationKey) =>
			`${applicationsBase}/${applicationKey}/workflowresponses`,
		[EndpointTypes.SUBMIT_APPLICATION]: () => `${applicationsBase}/submit`,
		[EndpointTypes.UPDATE_CUSTOMER_PHONE_NUMBER]: (applicationKey) =>
			`${applicationsBase}/${applicationKey}/customerphonenumber`,
	}
	return endpointMap[endpoint] ?? ((): string => "")
}

// export const useWorkflowData = (): UseQueryResult<Workflow | undefined> => {
//   const { state } = useMCEService();
//   const { application } = state.context;
//   if (typeof application === 'undefined') {
//     throw new Error('application data is undefined');
//   }
//   return useQuery(
//     ['workflowData', { applicationKey: application.applicationKey }],
//     () =>
//       fetchWorkflow({
//         applicationKey: application.applicationKey,
//         workflowID: application.workflowId,
//       })
//   );
// };

export const useSubmitData = (): Application | undefined => {
	const queryClient = useQueryClient()
	const submitData: Application | undefined =
		queryClient.getQueryData("submitData")
	return submitData
}

export const fetchWorkflow = ({
	applicationKey,
	workflowID,
}: {
	applicationKey: string
	workflowID: string
}): Promise<Workflow | null> =>
	fetchWrapper({
		url: getEndpoint(EndpointTypes.GET_WORKFLOW)(
			applicationKey,
			workflowID
		),
	})

export const fetchApplication = (
	applicationKey: string
): Promise<Application | null> =>
	fetchWrapper({
		url: getEndpoint(EndpointTypes.GET_APPLICATION)(applicationKey),
	})

export const sendWorkflowResponses = ({
	body,
	applicationKey,
}: {
	body: WorkflowResponsesBody
	applicationKey: string
}): Promise<unknown> =>
	fetchWrapper({
		method: "POST",
		url: getEndpoint(EndpointTypes.POST_RESPONSES)(applicationKey),
		body,
	})

export const sendApplicationSubmit = ({
	applicationKey,
}: {
	applicationKey: string
}): Promise<{ applicationKey: string; confirmationId: string } | null> =>
	fetchWrapper({
		method: "POST",
		url: getEndpoint(EndpointTypes.SUBMIT_APPLICATION)(applicationKey),
		body: {
			applicationKey,
		},
	})
