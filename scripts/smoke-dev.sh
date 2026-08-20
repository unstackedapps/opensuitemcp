#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "OpenSuiteMCP dev smoke checks"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for backend services"
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "Missing .env.local — run: pnpm setup:backend"
  exit 1
fi

if [ ! -f docker/.env ]; then
  echo "Missing docker/.env — run: pnpm setup:backend"
  exit 1
fi

PROJECT_NAME="$(grep '^PROJECT_NAME=' docker/.env | cut -d= -f2- | tr -d '"')"
PROJECT_NAME="${PROJECT_NAME:-opensuitemcp}"

echo "Starting backend services (${PROJECT_NAME})..."
docker compose --env-file docker/.env -f docker/docker-compose.yml -p "$PROJECT_NAME" up -d

echo "Syncing skills..."
pnpm skills:sync

echo "Running migrations..."
pnpm db:migrate

echo "Building app..."
pnpm build

PORT="${PORT:-3000}"
echo "Starting app on port ${PORT}..."
PORT="$PORT" pnpm start &
APP_PID=$!

cleanup() {
  kill "$APP_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${PORT}/ping" >/dev/null; then
    echo "Smoke passed: GET /ping"
    exit 0
  fi
  sleep 2
done

echo "Smoke failed: /ping did not become ready"
exit 1
