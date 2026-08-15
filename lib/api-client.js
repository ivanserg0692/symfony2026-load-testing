import http from 'k6/http';

import { refreshSession } from './auth.js';
import { checkJsonResponse } from './checks.js';
import { apiUrl, config } from './config.js';

function requestParams(endpoint, params = {}) {
  return {
    ...params,
    headers: {
      Accept: 'application/json',
      ...(params.headers || {}),
    },
    timeout: params.timeout || config.httpTimeout,
    tags: {
      ...(params.tags || {}),
      endpoint,
    },
  };
}

function requestWithRefresh(method, path, session, endpoint, body = null, params = {}) {
  let response = http.request(method, apiUrl(path), body, requestParams(endpoint, params));

  if (response.status === 401 && session) {
    refreshSession(session);
    response = http.request(method, apiUrl(path), body, requestParams(endpoint, params));
  }

  return response;
}

export function gatewayRequest(method, path, session, endpoint, body = null, params = {}) {
  return requestWithRefresh(method, path, session, endpoint, body, params);
}

export function gatewayJsonRequest(
  method,
  path,
  session,
  endpoint,
  requestName,
  expectedStatus,
  structureCheck,
  body = null,
  params = {},
) {
  const response = gatewayRequest(method, path, session, endpoint, body, params);

  return checkJsonResponse(response, requestName, expectedStatus, structureCheck);
}

export function gatewayGetJson(path, session, endpoint, requestName, expectedStatus, structureCheck, params = {}) {
  return gatewayJsonRequest('GET', path, session, endpoint, requestName, expectedStatus, structureCheck, null, params);
}
