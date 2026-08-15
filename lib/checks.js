import { check, fail } from 'k6';

import { config } from './config.js';

export function checkHttpResponse(response, requestName, expectedStatus) {
  check(response, {
    [`${requestName}: status is ${expectedStatus}`]: (res) => res.status === expectedStatus,
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
