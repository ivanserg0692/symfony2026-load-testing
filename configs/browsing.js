import { buildScenarioOptions } from '../lib/options.js';

export const browsingOptions = buildScenarioOptions({
  scenarioName: 'browsing',
  userAgent: 'k6-browsing-load-test/1.0',
  thresholdTag: 'browsing',
});
