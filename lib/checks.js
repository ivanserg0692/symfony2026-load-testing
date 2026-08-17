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
function responseDebugContext(response) {
  const context = [
    `status=${response.status}`,
    `content-type=${responseHeader(response, 'Content-Type') || 'none'}`,
  ];
  const profilerToken = responseHeader(response, 'X-Debug-Token');
  const profilerLink = responseHeader(response, 'X-Debug-Token-Link');

  if (profilerToken) {
    context.push(`profiler=${profilerToken}`);
  }

  if (profilerLink) {
    context.push(`profilerLink=${profilerLink}`);
  }

  return context.join('; ');
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
    fail(`${requestName}: expected JSON response; ${responseDebugContext(response)}`);
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
