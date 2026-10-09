#!/usr/bin/env bash
# Runs in the updater container. The app asks for an update by writing
# control/request.json; this runs `osmcp update` for it. When
# control/policy.json turns automatic updates on, it also installs the latest
# release once a day, in the hour OSMCP_AUTO_UPDATE_HOUR (UTC).
set -uo pipefail

OSMCP_DIR="${OSMCP_DIR:?OSMCP_DIR is not set}"
CONTROL="$OSMCP_DIR/control"
AUTO_HOUR="${OSMCP_AUTO_UPDATE_HOUR:-3}"
SELF="$(readlink -f "${BASH_SOURCE[0]}")"
SELF_SUM="$(md5sum "$SELF" | cut -d' ' -f1)"

# The app runs as uid 1001 and writes requests and the policy here.
mkdir -p "$CONTROL"
chown 1001:1001 "$CONTROL"
chmod 775 "$CONTROL"

json_field() {
  sed -n "s/.*\"$2\" *: *\"\{0,1\}\([^,\"}]*\)\"\{0,1\}.*/\1/p" "$1" 2>/dev/null | head -n1
}

run_update() {
  echo "[updater] osmcp update $1"
  bash "$OSMCP_DIR/osmcp" update "$1" > "$CONTROL/update.log" 2>&1
  chmod 644 "$CONTROL/update.log"
  tail -n 1 "$CONTROL/update.log"
  # An update can replace this script; start again on the new copy.
  if [ "$(md5sum "$SELF" | cut -d' ' -f1)" != "$SELF_SUM" ]; then
    echo "[updater] updater.sh changed; restarting it"
    exec bash "$SELF"
  fi
}

echo "[updater] watching $CONTROL"
last_auto=""
while true; do
  date -u +%Y-%m-%dT%H:%M:%SZ > "$CONTROL/heartbeat"

  if [ -f "$CONTROL/request.json" ]; then
    version="$(json_field "$CONTROL/request.json" version)"
    rm -f "$CONTROL/request.json"
    if [[ "$version" =~ ^(latest|v?[0-9A-Za-z][0-9A-Za-z.+-]{0,63})$ ]]; then
      run_update "$version"
    else
      echo "[updater] ignored a request for version '$version'"
    fi
  fi

  if [ "$(json_field "$CONTROL/policy.json" autoUpdate)" = "true" ]; then
    today="$(date -u +%F)"
    hour="$(date -u +%H)"
    if [ "$last_auto" != "$today" ] && [ "$((10#$hour))" -eq "$AUTO_HOUR" ]; then
      last_auto="$today"
      run_update latest
    fi
  fi

  sleep 5
done
