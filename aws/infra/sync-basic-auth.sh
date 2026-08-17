#!/bin/bash
# Apply SSM /opensuitemcp/http-basic-auth-enabled to Caddy without redeploying.
set -euo pipefail

REGION="${AWS_REGION:?AWS_REGION is required}"
SECRET_ARN="${BASIC_AUTH_SECRET_ARN:?BASIC_AUTH_SECRET_ARN is required}"
PARAM_NAME="${BASIC_AUTH_ENABLED_PARAMETER_NAME:?BASIC_AUTH_ENABLED_PARAMETER_NAME is required}"

SNIPPET="/opt/opensuitemcp/basic-auth.caddy"
STATE="/opt/opensuitemcp/basic-auth.state"
COMPOSE="/opt/opensuitemcp/compose.yml"
COMPOSE_ENV="/opt/opensuitemcp/.env"
DOCKER_COMPOSE="/usr/local/bin/docker-compose"
DOCKER="/usr/bin/docker"
DISABLED_SNIPPET="# HTTP basic auth disabled"$'\n'

param_err="$(mktemp)"
set +e
param_value="$(aws ssm get-parameter --region "$REGION" --name "$PARAM_NAME" \
  --query Parameter.Value --output text 2>"$param_err")"
param_rc=$?
set -e
if [ "$param_rc" -ne 0 ]; then
  if grep -q ParameterNotFound "$param_err"; then
    param_value=""
  else
    cat "$param_err" >&2
    rm -f "$param_err"
    exit 1
  fi
fi
rm -f "$param_err"

enabled=false
case "$(printf '%s' "$param_value" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')" in
  true|1|on|yes) enabled=true ;;
  *) enabled=false ;;
esac

write_state_and_snippet() {
  local desired_state="$1"
  local desired_snippet="$2"
  local current_state
  # $(cat) strips trailing newlines; append a sentinel so the comparison is exact.
  current_state="$(cat "$STATE" 2>/dev/null; printf x)" || true
  current_state="${current_state%x}"
  if [ "$current_state" = "$desired_state" ] && [ -f "$SNIPPET" ]; then
    return 1
  fi
  # Write the bind-mounted snippet in place. `mv` replaces the inode; Docker
  # keeps the old inode mounted, so Caddy would keep serving a stale hash.
  local tmp
  tmp="$(mktemp)"
  printf '%s' "$desired_snippet" > "$tmp"
  chmod 600 "$tmp"
  # Truncate + copy preserves the destination inode for bind mounts.
  : > "$SNIPPET"
  cat "$tmp" > "$SNIPPET"
  chmod 600 "$SNIPPET"
  rm -f "$tmp"
  printf '%s' "$desired_state" > "$STATE"
  chmod 600 "$STATE"
  return 0
}

reload_caddy() {
  if [ ! -f "$COMPOSE" ] || [ ! -f "$COMPOSE_ENV" ]; then
    return 0
  fi
  local caddy_id running
  caddy_id="$("$DOCKER_COMPOSE" --env-file "$COMPOSE_ENV" -f "$COMPOSE" ps -q caddy 2>/dev/null || true)"
  if [ -z "$caddy_id" ]; then
    return 0
  fi
  running="$("$DOCKER" inspect -f '{{.State.Running}}' "$caddy_id" 2>/dev/null || echo false)"
  if [ "$running" != true ]; then
    return 0
  fi
  "$DOCKER_COMPOSE" --env-file "$COMPOSE_ENV" -f "$COMPOSE" exec -T caddy \
    caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}

if [ "$enabled" = false ]; then
  if write_state_and_snippet "enabled=false"$'\n' "$DISABLED_SNIPPET"; then
    reload_caddy
    echo "HTTP basic auth disabled"
  fi
  exit 0
fi

secret_dir="$(mktemp -d)"
chmod 700 "$secret_dir"
trap 'rm -rf "$secret_dir"' EXIT
secret_err="$(mktemp)"
set +e
aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ARN" \
  --query '{SecretString:SecretString,VersionId:VersionId}' --output json \
  >"$secret_dir/payload.json" 2>"$secret_err"
secret_rc=$?
set -e
if [ "$secret_rc" -ne 0 ]; then
  cat "$secret_err" >&2
  rm -f "$secret_err"
  rm -rf "$secret_dir"
  exit 1
fi
rm -f "$secret_err"

python3 - "$secret_dir" <<'PY'
import json
import pathlib
import sys

out = pathlib.Path(sys.argv[1])
payload = json.loads((out / "payload.json").read_text())
secret = json.loads(payload["SecretString"])
user = secret.get("username") or ""
password = secret.get("password") or ""
version = payload.get("VersionId") or ""
(out / "user").write_text(user)
(out / "password").write_text(password)
(out / "version").write_text(version)
(out / "payload.json").unlink()
PY

BASIC_AUTH_USER="$(cat "$secret_dir/user")"
SECRET_VERSION="$(cat "$secret_dir/version")"
if [ -z "$BASIC_AUTH_USER" ] || [ ! -s "$secret_dir/password" ]; then
  echo "Basic auth secret missing username or password" >&2
  rm -rf "$secret_dir"
  exit 1
fi

desired_state="enabled=true"$'\n'"version=${SECRET_VERSION}"$'\n'"user=${BASIC_AUTH_USER}"$'\n'
# $(cat) strips trailing newlines; append a sentinel so the comparison is exact.
current_state="$(cat "$STATE" 2>/dev/null; printf x)" || true
current_state="${current_state%x}"
if [ "$current_state" = "$desired_state" ] && [ -f "$SNIPPET" ]; then
  rm -rf "$secret_dir"
  exit 0
fi

BASIC_AUTH_HASH="$("$DOCKER" run --rm caddy:2 caddy hash-password --plaintext "$(cat "$secret_dir/password")")"
rm -rf "$secret_dir"
case "$BASIC_AUTH_HASH" in
  \$2*) ;;
  *)
    echo "caddy hash-password did not return a bcrypt hash" >&2
    exit 1
    ;;
esac

# Use a quoted hash with single "$". Imported Caddyfile snippets do not
# unescape "$$" the way the main file does, so doubling breaks bcrypt.
desired_snippet="$(BASIC_AUTH_USER="$BASIC_AUTH_USER" BASIC_AUTH_HASH="$BASIC_AUTH_HASH" python3 <<'PY'
import os
user = os.environ["BASIC_AUTH_USER"]
hashed = os.environ["BASIC_AUTH_HASH"]
print(f'basic_auth {{\n\t{user} "{hashed}"\n}}\n', end="")
PY
)"
unset BASIC_AUTH_HASH

if write_state_and_snippet "$desired_state" "$desired_snippet"; then
  reload_caddy
  echo "HTTP basic auth enabled"
fi
