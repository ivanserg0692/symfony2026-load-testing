import { config } from '../lib/config.js';

export const shoppingOptions = {
  scenarios: {
    shopping: {
      executor: 'constant-vus',
      vus: config.vus,
      duration: config.duration,
      gracefulStop: '30s',
      tags: {
        env: config.tagEnv,
        scenario: 'shopping',
      },
    },
  },
  thresholds: {
    'http_req_failed{scenario:shopping}': ['rate<0.01'],
    'http_req_duration{scenario:shopping}': [`p(95)<${config.responseTimeLimitMs}`],
  },
  userAgent: 'k6-shopping-load-test/1.0',
};
