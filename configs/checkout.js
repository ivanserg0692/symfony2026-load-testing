import { buildScenarioOptions } from '../lib/options.js';

export const checkoutOptions = buildScenarioOptions({
  scenarioName: 'checkout',
  userAgent: 'k6-checkout-load-test/1.0',
  thresholdTag: 'checkout',
});
