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
├── configs/
└── tools/
```

## Directories

- `scenarios/` stores k6 entrypoint scripts. Planned scenario groups: `browsing`, `shopping`, `checkout`, `mixed`, `stress`, `spike`, and `soak`.
- `lib/` stores reusable JavaScript helpers shared by scenarios, such as HTTP clients, authentication helpers, checks, and request builders.
- `data/` stores test data in JSON or CSV format, such as users, products, carts, and checkout inputs.
- `configs/` stores reusable k6 options and load profiles so scenario files stay focused on user behavior.
- `tools/` stores local debugging utilities that are not used by k6 scenarios.

## Installation

Requirements:

- Docker
- Docker Compose

Create a local environment file:

```bash
cp load-testing/.env.example load-testing/.env
```

Edit `load-testing/.env` and set the target API Gateway URL, test user password, and Turnstile test token:

```env
BASE_URL=http://host.docker.internal
TEST_USER_PASSWORD=LoadTest123!
TURNSTILE_TOKEN=1x00000000000000000000AA
```

The Browsing, Shopping, and Checkout scenarios do not use a single login from `.env`. Each k6 Virtual User uses its own fixture user:

- VU 1 uses `load-user-001@test.local`
- VU 2 uses `load-user-002@test.local`
- VU 100 uses `load-user-100@test.local`

The password must match users created by `LoadTestUsersFixture`.

## Running k6

The k6 service uses the official `grafana/k6` image and is meant to be started manually.

Check the installed k6 version:

```bash
docker compose -f load-testing/docker-compose.yml run --rm k6 version
```

## Running Scenarios

Run the scenario selected by `LOAD_TEST_SCENARIO`:

```bash
docker compose -f load-testing/docker-compose.yml run --rm k6
```

Set the selected scenario in `load-testing/.env`:

```env
LOAD_TEST_SCENARIO=mixed
```

Supported values are `browsing`, `shopping`, `checkout`, and `mixed`.

For a one-off run, pass `LOAD_TEST_SCENARIO` before the Docker Compose command so Compose can use it while building the k6 command:

```bash
LOAD_TEST_SCENARIO=checkout docker compose -f load-testing/docker-compose.yml run --rm k6
```

You can also run a script directly by passing its path.

Run the Browsing scenario:

```bash
docker compose -f load-testing/docker-compose.yml run --rm k6 run /scripts/scenarios/browsing.js
```

Run the Shopping scenario:

```bash
docker compose -f load-testing/docker-compose.yml run --rm k6 run /scripts/scenarios/shopping.js
```

Run the Checkout scenario:

```bash
docker compose -f load-testing/docker-compose.yml run --rm k6 run /scripts/scenarios/checkout.js
```

Run the Mixed scenario:

```bash
docker compose -f load-testing/docker-compose.yml run --rm k6 run /scripts/scenarios/mixed.js
```

The Mixed scenario models the default traffic split as 75% Browsing, 20% Shopping, and 5% Checkout.

The repository is mounted into the container at `/scripts` in read-only mode.

The script exports k6 `options`, so k6 reads the load profile from the scenario file. One execution of the scenario function is one user iteration. k6 repeats iterations while the configured scenario is active.

The current scenario profiles use:

- `LOAD_TEST_VUS` - number of parallel Virtual Users.
- `LOAD_TEST_DURATION` - how long k6 keeps running iterations.

Example with a shorter Checkout run:

```bash
LOAD_TEST_SCENARIO=checkout LOAD_TEST_VUS=10 LOAD_TEST_DURATION=2m docker compose -f load-testing/docker-compose.yml run --rm k6
```

You can also edit these values in `load-testing/.env`:

```env
LOAD_TEST_SCENARIO=checkout
LOAD_TEST_VUS=10
LOAD_TEST_DURATION=2m
```

### About `docker compose -f load-testing/docker-compose.yml up -d`

Use `docker compose -f load-testing/docker-compose.yml run --rm` as the default local command for k6 tests. A k6 run is a foreground job: it starts, executes the scenario for `LOAD_TEST_DURATION`, prints the summary, and exits.

`docker compose -f load-testing/docker-compose.yml up -d` is less convenient for this runner because it detaches the container and hides the k6 summary in container logs. It can be used only when you explicitly want a detached run:

```bash
docker compose -f load-testing/docker-compose.yml --profile manual up -d k6
docker compose -f load-testing/docker-compose.yml --profile manual logs -f k6
```

For normal local checks, prefer:

```bash
docker compose -f load-testing/docker-compose.yml run --rm k6
```


## Debugging Slow Requests

When a k6 check reports a slow request, use the request URL and profiler token from the k6 error output to connect external latency with Symfony runtime.

The usual investigation chain is:

```text
k6 error -> API Gateway log -> X-Debug-Token -> Symfony profiler index -> profiler file -> Symfony runtime
```

Find slow API Gateway requests for one endpoint in a specific UTC time window:

```bash
docker compose logs api-gateway \
  --since '2026-08-17T09:25:20Z' \
  --until '2026-08-17T09:25:55Z' \
  | grep 'request_uri="/api/v1/catalog/sections' \
  | perl -ne 'if (/time="([^"]+)".*request_time="([^"]+)".*upstream_response_time="([^"]+)".*sent_x_debug_token="([^"]*)"/) { print "$2s upstream=$3s token=$4 time=$1\n" }' \
  | sort -nr
```

This shows the total gateway request time, upstream response time, profiler token, and timestamp. The `sent_x_debug_token` value is the Symfony profiler token returned to the client.

Check that a profiler token belongs to the expected Symfony request:

```bash
docker compose exec catalog-cli sh -lc 'grep "102397" var/cache/dev/profiler/index.csv'
```

The profiler index row contains the token, client IP, method, URL, timestamp, status, request type, and error flag. A matching row looks like this:

```csv
102397,172.18.0.22,GET,http://host.docker.internal/api/catalog/sections,1786958728,,200,request,0
```

Find all profiler tokens for the same endpoint:

```bash
docker compose run -T --rm -v ./load-testing/tools:/load-testing-tools:ro catalog-cli php /load-testing-tools/profiler-tokens.php \
  --url=http://host.docker.internal/api/catalog/sections
```

For a more precise search, filter the profiler index structurally by method, URL, and timestamp range:

```bash
docker compose run -T --rm -v ./load-testing/tools:/load-testing-tools:ro catalog-cli php /load-testing-tools/profiler-tokens.php \
  --method=GET \
  --url=http://host.docker.internal/api/catalog/sections \
  --from=2026-08-17T09:25:20Z \
  --to=2026-08-17T09:25:55Z
```

Use `--format=php` when you need a ready PHP array:

```bash
docker compose run -T --rm -v ./load-testing/tools:/load-testing-tools:ro catalog-cli php /load-testing-tools/profiler-tokens.php \
  --method=GET \
  --url=http://host.docker.internal/api/catalog/sections \
  --from=2026-08-17T09:25:20Z \
  --to=2026-08-17T09:25:55Z \
  --format=php
```

Find the physical profiler file for a token:

```bash
docker compose exec catalog-cli sh -lc 'find var/cache/dev/profiler -name df42f8 -type f'
```

Symfony stores profiler files under `var/cache/dev/profiler/<first-2-token-chars>/<next-2-token-chars>/<token>`. For example:

```text
var/cache/dev/profiler/df/42/df42f8
```

Profiler files are gzip-compressed PHP serialized data, so read them through PHP instead of `cat` or `grep`:

```bash
docker compose run -T --rm -v ./load-testing/tools:/load-testing-tools:ro catalog-cli php /load-testing-tools/profiler-durations.php df42f8
```

Compare several profiler tokens by Symfony runtime. By default, the output is sorted by Symfony duration descending:

```bash
docker compose run -T --rm -v ./load-testing/tools:/load-testing-tools:ro catalog-cli php /load-testing-tools/profiler-durations.php \
  df42f8 102397 895579 131941
```

You can pipe tokens from `profiler-tokens.php` directly into `profiler-durations.php`:

```bash
docker compose run -T --rm -v ./load-testing/tools:/load-testing-tools:ro catalog-cli php /load-testing-tools/profiler-tokens.php \
  --method=GET \
  --url=http://host.docker.internal/api/catalog/sections \
  --from=2026-08-17T09:25:20Z \
  --to=2026-08-17T09:25:55Z \
  | docker compose run -T --rm -i -v ./load-testing/tools:/load-testing-tools:ro catalog-cli php /load-testing-tools/profiler-durations.php
```

Interpret the timings separately:

- k6 response duration measures the client-observed request duration.
- API Gateway `request_time` measures the full gateway request time.
- API Gateway `upstream_response_time` measures how long the upstream service took from the gateway perspective.
- Symfony profiler `time` duration measures execution inside Symfony.
- Doctrine SQL time can be fast even when the request is slow, for example when waiting for a database connection, waiting in the PHP runtime, or spending time in serialization.

## Environment Variables

Variables from `load-testing/.env` are passed into the k6 container through `docker-compose.yml`.

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
- `LOAD_TEST_VUS` - default virtual user count for simple runs.
- `LOAD_TEST_DURATION` - default duration for simple runs.
- `LOAD_TEST_SCENARIO` - scenario entrypoint used by the default Docker Compose command.
- `K6_TAG_ENV` - environment tag for k6 metrics.
- `HTTP_TIMEOUT` - default HTTP timeout.
- `THINK_TIME_MIN` - lower bound for simulated user pauses.
- `THINK_TIME_MAX` - upper bound for simulated user pauses.

You can override variables for a single run:

```bash
LOAD_TEST_SCENARIO=browsing BASE_URL=https://stage.example.test LOAD_TEST_VUS=10 docker compose -f load-testing/docker-compose.yml run --rm k6
```

You can also pass k6 variables directly:

```bash
docker compose -f load-testing/docker-compose.yml run --rm k6 run -e BASE_URL=https://stage.example.test /scripts/scenarios/browsing.js
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

The `mixed` scenario models the `75/20/5` traffic split:

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
