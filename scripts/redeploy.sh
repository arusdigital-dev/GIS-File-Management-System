#!/usr/bin/env bash
set -euo pipefail

# Safe redeploy: rebuild images, restart stack, and run migrations.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/docker/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if grep -q '^APP_KEY=$' "$ENV_FILE"; then
  echo "APP_KEY is empty in $ENV_FILE. Set it before redeploying." >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "Building images..."
docker compose --env-file "$ENV_FILE" build

echo "Restarting services..."
docker compose --env-file "$ENV_FILE" up -d --remove-orphans

if [[ "${RUN_MIGRATIONS:-true}" == "true" ]]; then
  echo "Running migrations..."
  docker compose --env-file "$ENV_FILE" exec app php artisan migrate --force
else
  echo "Skipping migrations (set RUN_MIGRATIONS=true to enable)." 
fi

echo "Redeploy complete."
