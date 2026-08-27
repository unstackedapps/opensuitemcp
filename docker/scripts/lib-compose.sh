# Shared helpers for docker compose project name and paths.
# Sourced by teardown, reset, and setup scripts.

resolve_project_paths() {
  LIB_COMPOSE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  LIB_COMPOSE_PROJECT_ROOT="$(cd "${LIB_COMPOSE_SCRIPT_DIR}/../.." && pwd)"
  LIB_COMPOSE_ENV_FILE="${LIB_COMPOSE_PROJECT_ROOT}/docker/.env"
  LIB_COMPOSE_DEFAULT_NAME="$(basename "${LIB_COMPOSE_PROJECT_ROOT}")"
  LIB_COMPOSE_PROJECT_NAME="${LIB_COMPOSE_DEFAULT_NAME}"

  if [ -f "${LIB_COMPOSE_ENV_FILE}" ]; then
    # shellcheck disable=SC1090
    set -a
    # PROJECT_NAME may be unset in a stale file; POSTGRES_PW lines are fine to load.
    source "${LIB_COMPOSE_ENV_FILE}" 2>/dev/null || true
    set +a
    if [ -n "${PROJECT_NAME:-}" ]; then
      LIB_COMPOSE_PROJECT_NAME="${PROJECT_NAME}"
    fi
  fi

  LIB_COMPOSE_CMD=(
    docker compose
    --env-file "${LIB_COMPOSE_ENV_FILE}"
    -f "${LIB_COMPOSE_PROJECT_ROOT}/docker/docker-compose.yml"
    -p "${LIB_COMPOSE_PROJECT_NAME}"
  )
}
