import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';

import { checkHttpResponse, checkJsonResponse, hasResponseCookie } from './checks.js';
import { apiUrl, config, loadUserEmail, requireConfigValue } from './config.js';

function responseCookieValue(response, name) {
  const cookies = response.cookies && response.cookies[name];

  if (!Array.isArray(cookies) || cookies.length === 0) {
    return '';
  }

  return cookies[0].value || '';
}

function updateSessionCookies(session, response) {
  const authToken = responseCookieValue(response, config.authCookieName);
  const refreshToken = responseCookieValue(response, config.refreshCookieName);

  if (authToken) {
    session.cookies[config.authCookieName] = authToken;
  }

  if (refreshToken) {
    session.cookies[config.refreshCookieName] = refreshToken;
  }

  return session;
}

export function sessionCookieHeader(session) {
  if (!session || !session.cookies) {
    return '';
  }

  return Object.entries(session.cookies)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function requestParams(headers = {}, session = null) {
  const cookieHeader = sessionCookieHeader(session);

  return {
    headers: {
      Accept: 'application/json',
      Origin: config.origin,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...headers,
    },
    timeout: config.httpTimeout,
    tags: {
      endpoint: 'auth',
    },
  };
}

function getCsrfToken(tokenId = 'authenticate', session = null) {
  const query = tokenId === 'authenticate' ? '' : `?id=${encodeURIComponent(tokenId)}`;
  const csrfResponse = http.get(apiUrl(`/api/v1/auth/csrf${query}`), requestParams({}, session));
  const csrf = checkJsonResponse(csrfResponse, 'auth csrf', 200, (body) => (
    body !== null
    && typeof body === 'object'
    && typeof body.token === 'string'
    && body.token.length > 0
  ));

  const csrfHeaderName = typeof csrf.header_name === 'string' && csrf.header_name.length > 0
    ? csrf.header_name
    : 'X-CSRF-Token';

  return {
    headerName: csrfHeaderName,
    token: csrf.token,
  };
}

function checkAuthCookie(response, requestName) {
  check(response, {
    [`${requestName}: ${config.authCookieName} cookie is set`]: (res) => (
      hasResponseCookie(res, config.authCookieName)
    ),
  });
}

export function login() {
  const vuNumber = exec.vu.idInTest;
  const email = loadUserEmail(vuNumber);
  const password = requireConfigValue(config.testUserPassword, 'TEST_USER_PASSWORD');
  const turnstileToken = requireConfigValue(config.turnstileToken, 'TURNSTILE_TOKEN');
  const csrf = getCsrfToken();

  const loginResponse = http.post(
    apiUrl('/api/v1/auth/login'),
    JSON.stringify({
      email,
      password,
      turnstileToken,
    }),
    requestParams({
      'Content-Type': 'application/json',
      [csrf.headerName]: csrf.token,
    }),
  );

  checkHttpResponse(loginResponse, 'auth login', 200, { checkResponseTime: false });
  checkAuthCookie(loginResponse, 'auth login');

  return updateSessionCookies({
    cookies: {},
    email,
    vuNumber,
  }, loginResponse);
}

export function refreshSession(session) {
  const csrf = getCsrfToken('api_mutation', session);
  const refreshResponse = http.post(
    apiUrl('/api/v1/auth/refresh'),
    null,
    requestParams({
      [csrf.headerName]: csrf.token,
    }, session),
  );

  checkHttpResponse(refreshResponse, 'auth refresh', 200);
  checkAuthCookie(refreshResponse, 'auth refresh');

  return updateSessionCookies(session, refreshResponse);
}
