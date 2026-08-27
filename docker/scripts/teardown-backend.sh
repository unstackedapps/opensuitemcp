#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-compose.sh
source "${SCRIPT_DIR}/lib-compose.sh"
resolve_project_paths

cd "${LIB_COMPOSE_PROJECT_ROOT}"

echo "🧹 Tearing down local backend (project: ${LIB_COMPOSE_PROJECT_NAME})..."

if docker info > /dev/null 2>&1; then
  if [ -f "${LIB_COMPOSE_ENV_FILE}" ]; then
    echo "   Stopping containers and removing volumes..."
    "${LIB_COMPOSE_CMD[@]}" down -v
  else
    echo "⚠️  ${LIB_COMPOSE_ENV_FILE} not found — trying compose down with project name ${LIB_COMPOSE_PROJECT_NAME}."
    docker compose \
      -f "${LIB_COMPOSE_PROJECT_ROOT}/docker/docker-compose.yml" \
      -p "${LIB_COMPOSE_PROJECT_NAME}" \
      down -v 2>/dev/null || true
  fi
else
  echo "⚠️  Docker is not running — skipping compose down."
fi

rm -f .env.local .env.local.backup docker/.env

echo "✅ Removed .env.local, .env.local.backup, and docker/.env"
echo "   Note: only containers/volumes for compose project \"${LIB_COMPOSE_PROJECT_NAME}\" were removed."
echo "   Orphan postgres/redis from other project names must be removed manually in Docker Desktop."
echo "   Run pnpm bootstrap:local or pnpm reset:backend to set up again."
