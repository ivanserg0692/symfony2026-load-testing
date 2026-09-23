#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$script_dir/.env" ]]; then
  echo "Missing $script_dir/.env; create it from .env.example first" >&2
  exit 1
fi

compose=(docker compose --env-file "$script_dir/.env" -f "$script_dir/docker-compose.yml")

mapfile -t k6_identity < <(
  "${compose[@]}" run --rm --no-deps --entrypoint sh k6 -c 'id -u; id -g'
)

if [[ ${#k6_identity[@]} -ne 2 \
  || ! ${k6_identity[0]} =~ ^[0-9]+$ \
  || ! ${k6_identity[1]} =~ ^[0-9]+$ ]]; then
  echo "Unable to determine the k6 container user identity" >&2
  exit 1
fi

export AUTH_CACHE_OWNER_UID="${k6_identity[0]}"
export AUTH_CACHE_OWNER_GID="${k6_identity[1]}"

"${compose[@]}" run --rm auth-cache
"${compose[@]}" run --rm --no-deps k6 "$@"
