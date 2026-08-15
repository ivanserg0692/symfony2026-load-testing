# Load Testing

Minimal k6 infrastructure for load testing an existing online store.

This repository contains only the runner setup and project structure. The store, Grafana, Prometheus, databases, log storage, xk6 extensions, and Kubernetes are intentionally outside this project.

## Project Structure

```text
.
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── scenarios/
├── lib/
├── data/
└── configs/
```

## Directories

- `scenarios/` stores k6 entrypoint scripts. Planned scenario groups: `browsing`, `shopping`, `checkout`, `mixed`, `stress`, `spike`, and `soak`.
- `lib/` stores reusable JavaScript helpers shared by scenarios, such as HTTP clients, authentication helpers, checks, and request builders.
- `data/` stores test data in JSON or CSV format, such as users, products, carts, and checkout inputs.
- `configs/` stores reusable k6 options and load profiles so scenario files stay focused on user behavior.

## Installation

Requirements:

- Docker
- Docker Compose

Create a local environment file:

```bash
cp .env.example .env
```

Edit `.env` and set the target store URL and test user credentials:

```env
BASE_URL=https://shop.example.test
TEST_USER_LOGIN=test@example.com
TEST_USER_PASSWORD=secret
```

## Running k6

The k6 service uses the official `grafana/k6` image and is meant to be started manually.

Check the installed k6 version:

```bash
docker compose run --rm k6 version
```

## Running the First Scenario

Scenario implementation is intentionally not included yet. After adding a scenario file, run it by path:

```bash
docker compose run --rm k6 run /scripts/scenarios/browsing.js
```

Run another scenario the same way:

```bash
docker compose run --rm k6 run /scripts/scenarios/checkout.js
```

The repository is mounted into the container at `/scripts` in read-only mode.

## Environment Variables

Variables from `.env` are passed into the k6 container through `docker-compose.yml`.

Default variables:

- `BASE_URL` - target store base URL.
- `TARGET_ENV` - logical environment name, for example `local`, `stage`, or `prod-like`.
- `API_PREFIX` - optional API path prefix.
- `TEST_USER_LOGIN` - login for the test user.
- `TEST_USER_PASSWORD` - password for the test user.
- `K6_VUS` - default virtual user count for simple runs.
- `K6_DURATION` - default duration for simple runs.
- `K6_SCENARIO` - logical scenario name.
- `K6_TAG_ENV` - environment tag for k6 metrics.
- `HTTP_TIMEOUT` - default HTTP timeout.
- `THINK_TIME_MIN` - lower bound for simulated user pauses.
- `THINK_TIME_MAX` - upper bound for simulated user pauses.

You can override variables for a single run:

```bash
docker compose run --rm -e BASE_URL=https://stage.example.test -e K6_VUS=10 k6 run /scripts/scenarios/browsing.js
```

You can also pass k6 variables directly:

```bash
docker compose run --rm k6 run -e BASE_URL=https://stage.example.test /scripts/scenarios/browsing.js
```

## Adding Scenarios

Add new k6 entrypoint files under `scenarios/`.

Recommended names:

- `scenarios/browsing.js`
- `scenarios/shopping.js`
- `scenarios/checkout.js`
- `scenarios/mixed.js`
- `scenarios/stress.js`
- `scenarios/spike.js`
- `scenarios/soak.js`

Keep common code in `lib/`, input data in `data/`, and reusable load profiles in `configs/`.

The planned `mixed` scenario should later model the `75/20/5` traffic split:

- 75% browsing
- 20% shopping
- 5% checkout

## Scope

This project does not include:

- Grafana
- Prometheus
- PostgreSQL
- InfluxDB
- Loki
- xk6
- Kubernetes
