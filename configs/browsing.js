import { config } from '../lib/config.js';

export const browsingOptions = {
  scenarios: {
    browsing: {
      executor: 'constant-vus',
      vus: config.vus,
      duration: config.duration,
      gracefulStop: '30s',
      tags: {
        env: config.tagEnv,
        scenario: 'browsing',
      },
    },
  },
  thresholds: {
    'http_req_failed{scenario:browsing}': ['rate<0.01'],
    'http_req_duration{scenario:browsing}': [`p(95)<${config.responseTimeLimitMs}`],
  },
  userAgent: 'k6-browsing-load-test/1.0',
};
