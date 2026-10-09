#!/bin/sh
# Boot sequence for the published image: migrate, sync skill packs, serve.
set -e

echo "Running database migrations..."
node dist/migrate.mjs

if [ "${DISABLE_SKILLS_PACK_SYNC:-}" != "true" ]; then
  echo "Syncing Oracle and Community skills..."
  node dist/cli-sync-oracle.mjs
fi

echo "Starting OpenSuiteMCP..."
exec node server.js
