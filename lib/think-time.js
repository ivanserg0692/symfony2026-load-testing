import { sleep } from 'k6';

import { config } from './config.js';

export function thinkTime() {
  const duration = config.thinkTimeMin + (Math.random() * (config.thinkTimeMax - config.thinkTimeMin));

  sleep(duration);
}
