import {
	BadRequestError,
	ForbiddenError,
	NotFoundError,
} from "../constants/errorTypes"

interface FetchWrapperProps {
	method?: string
	url: string
	body?: Record<string, unknown>
	headers?: HeadersInit
}

/**
 * @function fetchWrapper
 * @param {Object} fetchObj includes properties method, url, body, additionalOptions
 * @param {string} fetchObj.method optional - defaults to 'GET'
 * @param {string} fetchObj.url first arg in fetch()
 * @param {Object|undefined} fetchObj.body request body to be serialized
 * @param {Object} fetchObj.additionalOptions other properties to spread onto fetch options config object
 * @description
 *   Wrapper for the fetch api that provides options defaults and base response code handling.
 * @return {Promise<Object>} A promise containing the deserialized response object.
 * */
export const fetchWrapper = async <Type extends unknown>({
	method = "GET",
	url,
	body,
	...additionalOptions
}: FetchWrapperProps): Promise<Type | null> => {
	const options = {
		...additionalOptions,
		method: method,
		headers: {
			...(additionalOptions.headers || {}),
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: body && JSON.stringify(body), // body can be undefined, that's ok
	}
	const response = await fetch(url, options)
	return handleResponse(response)
}
/**
 * @function handleResponse
 * @param {Object} response - The response object.
 * @description
 *   A handler for the fetch response Object
 * @return {Promise<Object>} A promise containing the deserialized response object.
 * */
const handleResponse = async <Type extends unknown>(
	response: Response
): Promise<Type | null> => {
	if (response.status === 401) {
		const error = new Error("Unauthorized")
		throw error
	}
	// if the status is 204, trying to parse the body will throw an error, so we return null
	if (response.status === 204) {
		return null
	}
	const res = await response.json()
	if (response.status === 400) {
		throw new BadRequestError(res.title)
	}
	if (response.status === 403) {
		throw new ForbiddenError(res.message)
	}
	if (response.status === 404) {
		throw new NotFoundError(res.title)
	}
	if (response.status < 200 || response.status >= 300) {
		throw new Error(
			`There has been an error. Response status: ${response.status}`
		)
	}
	return res
}
