import axios from "axios";

export const makeRequest = (options, addToResponse) => {
  return axios({ validateStatus: () => true, ...options })
    .then((response) => {
      if (response.status < 200 || response.status >= 300) throw response;
      return addToResponse
        ? {
            response,
            ...addToResponse,
          }
        : response;
    })
    .catch((error) => {
      throw error;
    });
};

export const generalRequest =
  (baseRoute) =>
  ({
    method,
    endpoint,
    timeout = 1000 * 60 * 10,
    data,
    params,
    headers,
    token,
    tokenType, // Bearer
    onUploadProgress,
    addToResponse,
  }) => {
    const urlFormatted = `${baseRoute}/${endpoint}`;
    const options = {
      method,
      url: urlFormatted,
      headers: {
        "Accept-Encoding": "application/json",
        ...headers,
      },
      timeout,
    };

    if (token && tokenType) options.headers = { ...headers, Authorization: `${tokenType} ${token}` };
    if (data) options.data = data;
    if (params) options.params = params;
    if (onUploadProgress) options.onUploadProgress = onUploadProgress;

    return makeRequest(options, addToResponse);
  };
