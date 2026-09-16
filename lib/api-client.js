import http from 'k6/http';

import { refreshSession, sessionCookieHeader } from './auth.js';
import { checkJsonResponse } from './checks.js';
import { apiUrl, config } from './config.js';

function requestParams(endpoint, session = null, params = {}) {
  const cookieHeader = sessionCookieHeader(session);

  return {
    ...params,
    headers: {
      Accept: 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(params.headers || {}),
    },
    timeout: params.timeout || config.httpTimeout,
    tags: {
      ...(params.tags || {}),
      endpoint,
      name: endpoint,
    },
  };
}

function requestWithRefresh(method, path, session, endpoint, body = null, params = {}) {
  const url = apiUrl(path);
  let context = { method, url, endpoint };
  let response = http.request(method, url, body, requestParams(endpoint, session, params));

  if (response.status === 401 && session) {
    refreshSession(session);
    response = http.request(method, url, body, requestParams(endpoint, session, params));
    context = { ...context, refreshed: true };
  }

  return { response, context };
}

export function gatewayRequest(method, path, session, endpoint, body = null, params = {}) {
  return gatewayRequestWithContext(method, path, session, endpoint, body, params).response;
}

export function gatewayRequestWithContext(method, path, session, endpoint, body = null, params = {}) {
  return requestWithRefresh(method, path, session, endpoint, body, params);
}

export function gatewayJsonRequest(
  method,
  path,
  session,
  endpoint,
  expectedStatus,
  structureCheck,
  body = null,
  params = {},
) {
  const { response, context } = requestWithRefresh(method, path, session, endpoint, body, params);

  return checkJsonResponse(response, endpoint, expectedStatus, structureCheck, context);
}

export function gatewayGetJson(path, session, endpoint, expectedStatus, structureCheck, params = {}) {
  return gatewayJsonRequest('GET', path, session, endpoint, expectedStatus, structureCheck, null, params);
}
