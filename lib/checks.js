import { check, fail } from 'k6';

import { config } from './config.js';

/**
 * @typedef {import('k6/http').Response} Response
 * @typedef {number|number[]} ExpectedStatus
 */

/**
 * @param {ExpectedStatus} expectedStatus
 * @returns {number[]}
 */
function normalizeExpectedStatuses(expectedStatus) {
  return Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
}

/**
 * @param {ExpectedStatus} expectedStatus
 * @returns {string}
 */
function expectedStatusLabel(expectedStatus) {
  return normalizeExpectedStatuses(expectedStatus).join(' or ');
}

/**
 * @param {Response} response
 * @param {string} name
 * @returns {string}
 */
function responseHeader(response, name) {
  if (Object.prototype.hasOwnProperty.call(response.headers, name)) {
    return response.headers[name];
  }

  const lowerName = name.toLowerCase();
  const headerName = Object.keys(response.headers).find((header) => (
    header.toLowerCase() === lowerName
  ));

  return headerName ? response.headers[headerName] : '';
}

/**
 * @param {Response} response
 * @returns {string}
 */
function responseErrorMessage(response) {
  if (response.status !== 409) {
    return '';
  }

  try {
    const body = response.json();

    if (typeof body?.message !== 'string') {
      return '';
    }

    return body.message.replace(/\s+/g, ' ').trim();
  } catch (error) {
    return '';
  }
}

/**
 * @param {Response} response
 * @param {{method?: string, url?: string, endpoint?: string}} requestContext
 * @returns {string}
 */
function responseDebugContext(response, requestContext = {}) {
  const context = [
    requestContext.method ? `method=${requestContext.method}` : null,
    requestContext.url ? `url=${requestContext.url}` : (response.url ? `url=${response.url}` : null),
    `status=${response.status}`,
    response.timings && typeof response.timings.duration === 'number'
      ? `duration=${Math.round(response.timings.duration)}ms`
      : null,
    requestContext.endpoint ? `endpoint=${requestContext.endpoint}` : null,
    `content-type=${responseHeader(response, 'Content-Type') || 'none'}`,
  ].filter(Boolean);
  const profilerToken = responseHeader(response, 'X-Debug-Token');
  const profilerLink = responseHeader(response, 'X-Debug-Token-Link');
  const errorMessage = responseErrorMessage(response);

  if (errorMessage) {
    context.push(`message=${JSON.stringify(errorMessage)}`);
  }

  if (profilerToken) {
    context.push(`profiler=${profilerToken}`);
  }

  if (profilerLink) {
    context.push(`profilerLink=${profilerLink}`);
  }

  return context.join('; ');
}

function logFailedCheck(response, requestName, checkName, requestContext = {}) {
  console.error(`${requestName}: ${checkName} failed; ${responseDebugContext(response, requestContext)}`);
}

/**
 * @param {Response} response
 * @param {string} requestName
 * @param {ExpectedStatus} expectedStatus
 * @param {{method?: string, url?: string, endpoint?: string, checkResponseTime?: boolean}} requestContext
 * @returns {Response}
 */
export function checkHttpResponse(response, requestName, expectedStatus, requestContext = {}) {
  const expectedStatuses = normalizeExpectedStatuses(expectedStatus);
  const statusPassed = expectedStatuses.includes(response.status);

  const responseChecks = {
    [`${requestName}: status is ${expectedStatusLabel(expectedStatus)}`]: (res) => {
      if (!statusPassed) {
        logFailedCheck(res, requestName, `status is ${expectedStatusLabel(expectedStatus)}`, requestContext);
      }

      return statusPassed;
    },
  };

  if (requestContext.checkResponseTime !== false) {
    responseChecks[`${requestName}: response time <= ${config.responseTimeLimitMs}ms`] = (res) => {
      const passed = res.timings.duration <= config.responseTimeLimitMs;

      if (!passed) {
        logFailedCheck(res, requestName, `response time <= ${config.responseTimeLimitMs}ms`, requestContext);
      }

      return passed;
    };
  }

  check(response, responseChecks);

  if (!statusPassed) {
    fail(`${requestName}: unexpected response status; ${responseDebugContext(response, requestContext)}`);
  }

  return response;
}

export function parseJsonResponse(response, requestName, requestContext = {}) {
  try {
    return response.json();
  } catch (error) {
    check(response, {
      [`${requestName}: body is valid JSON`]: () => false,
    });
    fail(`${requestName}: expected JSON response; ${responseDebugContext(response, requestContext)}`);
  }

  return null;
}

export function checkJsonResponse(response, requestName, expectedStatus, structureCheck, requestContext = {}) {
  checkHttpResponse(response, requestName, expectedStatus, requestContext);

  const body = parseJsonResponse(response, requestName, requestContext);

  if (typeof structureCheck === 'function') {
    const structurePassed = structureCheck(body);

    check(body, {
      [`${requestName}: response structure is valid`]: () => structurePassed,
    });

    if (!structurePassed) {
      fail(`${requestName}: unexpected response structure; ${responseDebugContext(response, requestContext)}`);
    }
  }

  return body;
}

export function ensureArrayNotEmpty(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${name} is empty or invalid`);
  }

  return value;
}

export function hasResponseCookie(response, cookieName) {
  return Object.prototype.hasOwnProperty.call(response.cookies, cookieName)
    && Array.isArray(response.cookies[cookieName])
    && response.cookies[cookieName].length > 0;
}
