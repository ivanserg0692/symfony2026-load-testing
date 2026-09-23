import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail } from 'k6';
import { SharedArray } from 'k6/data';

import { checkHttpResponse, checkJsonResponse, hasResponseCookie } from './checks.js';
import { apiUrl, config } from './config.js';

function loadSessionCache() {
  let cache;

  try {
    cache = JSON.parse(open(config.authSessionCacheFile));
  } catch (error) {
    throw new Error(
      `Unable to read auth session cache ${config.authSessionCacheFile}. Run load-testing/run.sh to prepare it: ${error.message}`,
    );
  }

  if (!cache || cache.version !== 1 || !Array.isArray(cache.sessions)) {
    throw new Error(`Auth session cache ${config.authSessionCacheFile} is invalid`);
  }

  if (cache.sessions.length < config.vus) {
    throw new Error(
      `Auth session cache contains ${cache.sessions.length} sessions, but ${config.vus} are required`,
    );
  }

  return cache.sessions.slice(0, config.vus);
}

const cachedSessions = new SharedArray('auth sessions', loadSessionCache);

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

function requestParams(headers = {}, session = null, requestName = 'auth') {
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
      name: requestName,
    },
  };
}

function getCsrfToken(tokenId = 'authenticate', session = null) {
  const query = tokenId === 'authenticate' ? '' : `?id=${encodeURIComponent(tokenId)}`;
  const csrfResponse = http.get(
    apiUrl(`/api/v1/auth/csrf${query}`),
    requestParams({}, session, 'auth_csrf'),
  );
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
  const cookiePresent = hasResponseCookie(response, config.authCookieName);

  check(response, {
    [`${requestName}: ${config.authCookieName} cookie is set`]: () => cookiePresent,
  });

  if (!cookiePresent) {
    fail(`${requestName}: ${config.authCookieName} cookie is missing`);
  }
}

export function initializeSessions() {
  console.log(`setup authorization: loaded ${cachedSessions.length}/${config.vus} cached users`);

  return { sessionCount: cachedSessions.length };
}

export function getVuSession(setupData) {
  const vuNumber = exec.vu.idInTest;
  const cachedSession = setupData
    && setupData.sessionCount >= vuNumber
    ? cachedSessions[vuNumber - 1]
    : null;

  if (!cachedSession) {
    fail(`setup session for VU ${vuNumber} is missing`);
  }

  return {
    ...cachedSession,
    cookies: { ...cachedSession.cookies },
  };
}

export function refreshSession(session) {
  const csrf = getCsrfToken('api_mutation', session);
  const refreshResponse = http.post(
    apiUrl('/api/v1/auth/refresh'),
    null,
    requestParams({
      [csrf.headerName]: csrf.token,
    }, session, 'auth_refresh'),
  );

  checkHttpResponse(refreshResponse, 'auth refresh', 200);
  checkAuthCookie(refreshResponse, 'auth refresh');

  return updateSessionCookies(session, refreshResponse);
}
