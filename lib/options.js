import { config } from './config.js';

export function buildScenarioOptions({ scenarioName, userAgent, thresholdTag = scenarioName, vus = config.vus, duration = config.duration }) {
  return {
    scenarios: {
      [scenarioName]: {
        executor: 'constant-vus',
        vus,
        duration,
        gracefulStop: '30s',
        tags: {
          env: config.tagEnv,
          scenario: scenarioName,
        },
      },
    },
    thresholds: {
      [`http_req_failed{scenario:${thresholdTag}}`]: ['rate<0.01'],
      [`http_req_duration{scenario:${thresholdTag}}`]: [`p(95)<${config.responseTimeLimitMs}`],
    },
    userAgent,
  };
}
