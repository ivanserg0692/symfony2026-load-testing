import { buildScenarioOptions } from '../lib/options.js';

export const shoppingOptions = buildScenarioOptions({
  scenarioName: 'shopping',
  userAgent: 'k6-shopping-load-test/1.0',
  thresholdTag: 'shopping',
});
