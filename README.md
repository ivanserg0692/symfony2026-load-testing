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

Edit `.env` and set the target API Gateway URL, test user password, and Turnstile test token:

```env
BASE_URL=http://host.docker.internal
TEST_USER_PASSWORD=LoadTest123!
TURNSTILE_TOKEN=1x00000000000000000000AA
```

The Browsing scenario does not use a single login from `.env`. Each k6 Virtual User uses its own fixture user:

- VU 1 uses `load-user-001@test.local`
- VU 2 uses `load-user-002@test.local`
- VU 100 uses `load-user-100@test.local`

The password must match users created by `LoadTestUsersFixture`.

## Running k6

The k6 service uses the official `grafana/k6` image and is meant to be started manually.

Check the installed k6 version:

```bash
docker compose run --rm k6 version
```

## Running Browsing

Run the Browsing scenario:

```bash
docker compose run --rm k6 run /scripts/scenarios/browsing.js
```

The repository is mounted into the container at `/scripts` in read-only mode.

The script exports k6 `options`, so k6 reads the load profile from the scenario file. One execution of the scenario function is one user iteration. k6 repeats iterations while the configured scenario is active.

The current Browsing profile uses:

- `K6_VUS` - number of parallel Virtual Users.
- `K6_DURATION` - how long k6 keeps running iterations.

Example:

```bash
K6_VUS=10 K6_DURATION=2m docker compose run --rm k6 run /scripts/scenarios/browsing.js
```

You can also edit these values in `.env`:

```env
K6_VUS=10
K6_DURATION=2m
```

### About `docker compose up -d`

Use `docker compose run --rm` as the default local command for k6 tests. A k6 run is a foreground job: it starts, executes the scenario for `K6_DURATION`, prints the summary, and exits.

`docker compose up -d` is less convenient for this runner because it detaches the container and hides the k6 summary in container logs. It can be used only when you explicitly want a detached run:

```bash
docker compose --profile manual up -d k6
docker compose --profile manual logs -f k6
```

For normal local checks, prefer:

```bash
docker compose run --rm k6 run /scripts/scenarios/browsing.js
```

## Environment Variables

Variables from `.env` are passed into the k6 container through `docker-compose.yml`.

Default variables:

- `BASE_URL` - target store base URL.
- `TARGET_ENV` - logical environment name, for example `local`, `stage`, or `prod-like`.
- `API_PREFIX` - optional API path prefix.
- `TEST_USER_PASSWORD` - password for fixture users `load-user-001@test.local` through `load-user-100@test.local`.
- `TURNSTILE_TOKEN` - Turnstile test token used by the login request.
- `AUTH_COOKIE_NAME` - authentication cookie name expected after login and refresh.
- `REFRESH_COOKIE_NAME` - refresh cookie name set by the API Gateway.
- `CATALOG_LIMIT` - number of catalog items requested for random product selection.
- `MAX_RESPONSE_TIME_MS` - response time check limit used by HTTP checks and thresholds.
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
