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
 * @param {string} requestName
 * @param {ExpectedStatus} expectedStatus
 * @returns {Response}
 */
export function checkHttpResponse(response, requestName, expectedStatus) {
  const expectedStatuses = normalizeExpectedStatuses(expectedStatus);

  check(response, {
    [`${requestName}: status is ${expectedStatusLabel(expectedStatus)}`]: (res) => (
      expectedStatuses.includes(res.status)
    ),
    [`${requestName}: response time <= ${config.responseTimeLimitMs}ms`]: (res) => (
      res.timings.duration <= config.responseTimeLimitMs
    ),
  });

  return response;
}

export function parseJsonResponse(response, requestName) {
  try {
    return response.json();
  } catch (error) {
    check(response, {
      [`${requestName}: body is valid JSON`]: () => false,
    });
    fail(`${requestName}: expected JSON response`);
  }

  return null;
}

export function checkJsonResponse(response, requestName, expectedStatus, structureCheck) {
  checkHttpResponse(response, requestName, expectedStatus);

  const body = parseJsonResponse(response, requestName);

  if (typeof structureCheck === 'function') {
    check(body, {
      [`${requestName}: response structure is valid`]: structureCheck,
    });
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
