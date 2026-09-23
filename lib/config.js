const DEFAULT_BASE_URL = 'http://host.docker.internal';

export const MAX_LOAD_TEST_USERS = 1000;

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
  authSessionCacheFile: __ENV.AUTH_SESSION_CACHE_FILE || '/scripts/.cache/auth-sessions.json',
  baseUrl: normalizeBaseUrl(__ENV.BASE_URL),
  catalogLimit: parsePositiveInt(__ENV.CATALOG_LIMIT, 20),
  duration: __ENV.LOAD_TEST_DURATION || '30s',
  httpTimeout: __ENV.HTTP_TIMEOUT || '30s',
  origin: resolveOrigin(__ENV.REQUEST_ORIGIN || __ENV.BASE_URL),
  refreshCookieName: __ENV.REFRESH_COOKIE_NAME || 'refresh_token',
  responseTimeLimitMs: parsePositiveInt(__ENV.MAX_RESPONSE_TIME_MS, 1000),
  setupTimeout: __ENV.LOAD_TEST_SETUP_TIMEOUT || '20m',
  tagEnv: __ENV.K6_TAG_ENV || __ENV.TARGET_ENV || 'local',
  thinkTimeMax: Math.max(thinkTimeMin, thinkTimeMax),
  thinkTimeMin,
  vus,
};

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${config.baseUrl}${config.apiPrefix}${normalizedPath}`;
}
