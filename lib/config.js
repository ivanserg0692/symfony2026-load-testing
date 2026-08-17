const DEFAULT_BASE_URL = 'http://host.docker.internal';

export const MAX_LOAD_TEST_USERS = 100;

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value || '', 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(value, fallback) {
  const parsed = parseFloat(value || '');

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function resolveOrigin(value) {
  const normalized = normalizeBaseUrl(value);
  const match = normalized.match(/^(https?:\/\/[^/]+)/);

  return match ? match[1] : normalized;
}

function normalizeApiPrefix(value) {
  const trimmed = (value || '').trim();

  if (trimmed === '') {
    return '';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

const vus = parsePositiveInt(__ENV.LOAD_TEST_VUS, 1);

if (vus > MAX_LOAD_TEST_USERS) {
  throw new Error(`LOAD_TEST_VUS must be <= ${MAX_LOAD_TEST_USERS} because LoadTestUsersFixture creates ${MAX_LOAD_TEST_USERS} users`);
}

const thinkTimeMin = parsePositiveFloat(__ENV.THINK_TIME_MIN, 1);
const thinkTimeMax = parsePositiveFloat(__ENV.THINK_TIME_MAX, 3);

export const config = {
  apiPrefix: normalizeApiPrefix(__ENV.API_PREFIX),
  authCookieName: __ENV.AUTH_COOKIE_NAME || 'AUTH_TOKEN',
  baseUrl: normalizeBaseUrl(__ENV.BASE_URL),
  catalogLimit: parsePositiveInt(__ENV.CATALOG_LIMIT, 20),
  duration: __ENV.LOAD_TEST_DURATION || '30s',
  httpTimeout: __ENV.HTTP_TIMEOUT || '30s',
  origin: resolveOrigin(__ENV.REQUEST_ORIGIN || __ENV.BASE_URL),
  refreshCookieName: __ENV.REFRESH_COOKIE_NAME || 'refresh_token',
  responseTimeLimitMs: parsePositiveInt(__ENV.MAX_RESPONSE_TIME_MS, 1000),
  tagEnv: __ENV.K6_TAG_ENV || __ENV.TARGET_ENV || 'local',
  testUserPassword: __ENV.TEST_USER_PASSWORD || __ENV.LOAD_TEST_USER_PASSWORD || '',
  thinkTimeMax: Math.max(thinkTimeMin, thinkTimeMax),
  thinkTimeMin,
  turnstileToken: __ENV.TURNSTILE_TOKEN || __ENV.TEST_TURNSTILE_TOKEN || '',
  vus,
};

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${config.baseUrl}${config.apiPrefix}${normalizedPath}`;
}

export function requireConfigValue(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

export function loadUserEmail(vuNumber) {
  if (!Number.isInteger(vuNumber) || vuNumber < 1 || vuNumber > MAX_LOAD_TEST_USERS) {
    throw new Error(`VU number must be between 1 and ${MAX_LOAD_TEST_USERS}, got ${vuNumber}`);
  }

  return `load-user-${String(vuNumber).padStart(3, '0')}@test.local`;
}
