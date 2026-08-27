#!/bin/bash
# Thin wrapper — interactive setup runs in Node (@clack/prompts TUI).
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"
exec pnpm exec tsx docker/scripts/setup-backend.ts
