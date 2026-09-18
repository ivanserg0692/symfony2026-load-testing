import { config } from '../lib/config.js';

const MIXED_DISTRIBUTION = [
  { name: 'browsing', exec: 'browsing', weight: 75 },
  { name: 'shopping', exec: 'shopping', weight: 20 },
  { name: 'checkout', exec: 'checkout', weight: 5 },
];

function allocateMixedVus(totalVus) {
  const allocated = MIXED_DISTRIBUTION.map((scenario) => {
    const exactVus = (totalVus * scenario.weight) / 100;

    return {
      ...scenario,
      fraction: exactVus % 1,
      vus: Math.floor(exactVus),
    };
  });

  let remainingVus = totalVus - allocated.reduce((sum, scenario) => sum + scenario.vus, 0);

  allocated
    .sort((left, right) => right.fraction - left.fraction || left.weight - right.weight)
    .forEach((scenario) => {
      if (remainingVus > 0) {
        scenario.vus += 1;
        remainingVus -= 1;
      }
    });

  return allocated.sort((left, right) => right.weight - left.weight);
}

function mixedScenario({ exec, name, vus }) {
  return {
    executor: 'constant-vus',
    exec,
    vus,
    duration: config.duration,
    gracefulStop: '30s',
    tags: {
      env: config.tagEnv,
      scenario: name,
    },
  };
}

function mixedThresholds(scenarios) {
  const thresholds = Object.keys(scenarios).reduce((thresholds, scenarioName) => ({
    ...thresholds,
    [`http_req_failed{scenario:${scenarioName}}`]: ['rate<0.01'],
    [`http_req_duration{scenario:${scenarioName}}`]: [`p(95)<${config.responseTimeLimitMs}`],
  }), {});

  if (scenarios.checkout) {
    thresholds.order_create_unexpected_conflicts = ['rate==0'];
  }

  return thresholds;
}

const mixedScenarios = Object.fromEntries(
  allocateMixedVus(config.vus)
    .filter((scenario) => scenario.vus > 0)
    .map((scenario) => [scenario.name, mixedScenario(scenario)]),
);

export const mixedOptions = {
  scenarios: mixedScenarios,
  thresholds: mixedThresholds(mixedScenarios),
  userAgent: 'k6-mixed-load-test/1.0',
};
