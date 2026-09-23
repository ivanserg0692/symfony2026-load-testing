import { chmod, chown, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_REUSE_MARGIN_MS = 60 * 1000;
const MAX_LOAD_TEST_USERS = 1000;

function requiredEnvironmentValue(name) {
  const value = process.env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

function positiveInteger(value, fallback, name) {
  const parsed = Number.parseInt(value || '', 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function nonNegativeInteger(value, name) {
  const parsed = Number.parseInt(value || '', 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function durationMilliseconds(value, fallback, name) {
  const duration = value || fallback;
  const units = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
    ms: 1,
  };
  const pattern = /(\d+(?:\.\d+)?)(ms|d|h|m|s)/gy;
  let total = 0;
  let consumed = 0;
  let match;

  while ((match = pattern.exec(duration)) !== null) {
    total += Number.parseFloat(match[1]) * units[match[2]];
    consumed = pattern.lastIndex;
  }

  if (consumed !== duration.length || total <= 0) {
    throw new Error(`${name} has unsupported duration value: ${duration}`);
  }

  return total;
}

function normalizedBaseUrl(value) {
  return (value || 'http://host.docker.internal').replace(/\/+$/, '');
}

function normalizedApiPrefix(value) {
  const trimmed = (value || '').trim();

  return trimmed === '' ? '' : `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function resolvedOrigin(value) {
  const normalized = normalizedBaseUrl(value);

  try {
    return new URL(normalized).origin;
  } catch {
    return normalized;
  }
}

function responseCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);

  return Object.fromEntries(values.map((header) => {
    const pair = header.split(';', 1)[0];
    const separator = pair.indexOf('=');

    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

function cookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function checkedFetch(url, options, requestName, timeoutMs) {
  let response;

  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`${requestName} request failed: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`${requestName} returned HTTP ${response.status}`);
  }

  return response;
}

async function login(vuNumber, settings) {
  const csrfResponse = await checkedFetch(
    `${settings.apiBaseUrl}/api/v1/auth/csrf`,
    {
      headers: {
        Accept: 'application/json',
        Origin: settings.origin,
      },
    },
    `auth csrf for user ${vuNumber}`,
    settings.httpTimeoutMs,
  );
  const csrfCookies = responseCookies(csrfResponse);
  const csrf = await csrfResponse.json();

  if (!csrf || typeof csrf.token !== 'string' || csrf.token === '') {
    throw new Error(`auth csrf for user ${vuNumber} returned an invalid token`);
  }

  const csrfHeaderName = typeof csrf.header_name === 'string' && csrf.header_name !== ''
    ? csrf.header_name
    : 'X-CSRF-Token';
  const email = `load-user-${String(vuNumber).padStart(3, '0')}@test.local`;
  const loginResponse = await checkedFetch(
    `${settings.apiBaseUrl}/api/v1/auth/login`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: cookieHeader(csrfCookies),
        Origin: settings.origin,
        [csrfHeaderName]: csrf.token,
      },
      body: JSON.stringify({
        email,
        password: settings.password,
        turnstileToken: settings.turnstileToken,
      }),
    },
    `auth login for user ${vuNumber}`,
    settings.httpTimeoutMs,
  );
  const cookies = responseCookies(loginResponse);

  if (!cookies[settings.authCookieName]) {
    throw new Error(`auth login for user ${vuNumber} did not set ${settings.authCookieName}`);
  }

  if (!cookies[settings.refreshCookieName]) {
    throw new Error(`auth login for user ${vuNumber} did not set ${settings.refreshCookieName}`);
  }

  return {
    cookies: {
      [settings.authCookieName]: cookies[settings.authCookieName],
      [settings.refreshCookieName]: cookies[settings.refreshCookieName],
    },
    email,
    vuNumber,
  };
}

function validSession(session, index, settings) {
  return session
    && session.vuNumber === index + 1
    && typeof session.email === 'string'
    && session.cookies
    && typeof session.cookies[settings.authCookieName] === 'string'
    && session.cookies[settings.authCookieName] !== ''
    && typeof session.cookies[settings.refreshCookieName] === 'string'
    && session.cookies[settings.refreshCookieName] !== '';
}

function reusableCache(cache, settings, now) {
  if (!cache || cache.version !== CACHE_VERSION || !Array.isArray(cache.sessions)) {
    return false;
  }

  const createdAt = Date.parse(cache.createdAt);
  const remainingLifetime = createdAt + CACHE_TTL_MS - now;
  const requiredLifetime = settings.testDurationMs + CACHE_REUSE_MARGIN_MS;

  return Number.isFinite(createdAt)
    && createdAt <= now
    && remainingLifetime > 0
    && requiredLifetime < CACHE_TTL_MS
    && remainingLifetime >= requiredLifetime
    && cache.baseUrl === settings.baseUrl
    && cache.apiPrefix === settings.apiPrefix
    && cache.authCookieName === settings.authCookieName
    && cache.refreshCookieName === settings.refreshCookieName
    && cache.sessions.length >= settings.vus
    && cache.sessions.slice(0, settings.vus).every((session, index) => (
      validSession(session, index, settings)
    ));
}

async function readCache(cacheFile) {
  try {
    return JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

async function writeCache(cacheFile, cache) {
  const cacheDirectory = dirname(cacheFile);
  const temporaryFile = `${cacheFile}.${process.pid}.tmp`;

  await mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
  await chmod(cacheDirectory, 0o700);

  try {
    await writeFile(temporaryFile, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporaryFile, 0o600);
    await rename(temporaryFile, cacheFile);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}

async function assignCacheOwnership(cacheFile, ownerUid, ownerGid) {
  await chown(cacheFile, ownerUid, ownerGid);
  await chown(dirname(cacheFile), ownerUid, ownerGid);
}

async function main() {
  const vus = positiveInteger(process.env.LOAD_TEST_VUS, 1, 'LOAD_TEST_VUS');

  if (vus > MAX_LOAD_TEST_USERS) {
    throw new Error(`LOAD_TEST_VUS must be <= ${MAX_LOAD_TEST_USERS}`);
  }

  const baseUrl = normalizedBaseUrl(process.env.BASE_URL);
  const apiPrefix = normalizedApiPrefix(process.env.API_PREFIX);
  const settings = {
    apiBaseUrl: `${baseUrl}${apiPrefix}`,
    apiPrefix,
    authCookieName: process.env.AUTH_COOKIE_NAME || 'AUTH_TOKEN',
    baseUrl,
    cacheFile: process.env.AUTH_SESSION_CACHE_FILE || '/scripts/.cache/auth-sessions.json',
    cacheOwnerGid: nonNegativeInteger(
      process.env.AUTH_CACHE_OWNER_GID,
      'AUTH_CACHE_OWNER_GID',
    ),
    cacheOwnerUid: nonNegativeInteger(
      process.env.AUTH_CACHE_OWNER_UID,
      'AUTH_CACHE_OWNER_UID',
    ),
    httpTimeoutMs: durationMilliseconds(process.env.HTTP_TIMEOUT, '30s', 'HTTP_TIMEOUT'),
    origin: resolvedOrigin(process.env.REQUEST_ORIGIN || baseUrl),
    password: requiredEnvironmentValue('TEST_USER_PASSWORD'),
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'refresh_token',
    testDurationMs: durationMilliseconds(
      process.env.LOAD_TEST_DURATION,
      '30s',
      'LOAD_TEST_DURATION',
    ),
    turnstileToken: requiredEnvironmentValue('TURNSTILE_TOKEN'),
    vus,
  };
  const now = Date.now();
  const existingCache = await readCache(settings.cacheFile);

  if (reusableCache(existingCache, settings, now)) {
    await assignCacheOwnership(
      settings.cacheFile,
      settings.cacheOwnerUid,
      settings.cacheOwnerGid,
    );
    console.log(`auth cache: reusing ${vus} sessions created at ${existingCache.createdAt}`);
    return;
  }

  if (existingCache !== null) {
    await rm(settings.cacheFile, { force: true });
    console.log('auth cache: removed expired or incompatible cache');
  }

  const sessions = [];
  const createdAt = new Date().toISOString();
  const progressStep = Math.max(1, Math.ceil(vus / 20));

  for (let index = 0; index < vus; index += 1) {
    sessions.push(await login(index + 1, settings));

    const authorizedUsers = index + 1;

    if (authorizedUsers % progressStep === 0 || authorizedUsers === vus) {
      console.log(`auth cache authorization: ${authorizedUsers}/${vus} users`);
    }
  }

  await writeCache(settings.cacheFile, {
    version: CACHE_VERSION,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + CACHE_TTL_MS).toISOString(),
    baseUrl: settings.baseUrl,
    apiPrefix: settings.apiPrefix,
    authCookieName: settings.authCookieName,
    refreshCookieName: settings.refreshCookieName,
    sessions,
  });
  await assignCacheOwnership(
    settings.cacheFile,
    settings.cacheOwnerUid,
    settings.cacheOwnerGid,
  );
  console.log(`auth cache: saved ${sessions.length} sessions until ${new Date(Date.parse(createdAt) + CACHE_TTL_MS).toISOString()}`);
}

await main();
