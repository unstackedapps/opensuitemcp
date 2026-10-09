#!/usr/bin/env bash
# Install OpenSuiteMCP on one Linux server with Docker.
#
#   curl -fsSL https://raw.githubusercontent.com/unstackedapps/opensuitemcp/main/deploy/install.sh \
#     | sudo bash -s -- --domain osmcp.example.com --mode org --root-email you@example.com
#
# Run again with the same flags to repair an install; an existing .env, and the
# secrets in it, are kept.
set -euo pipefail

REPO="unstackedapps/opensuitemcp"
DIR="/opt/opensuitemcp"
VERSION="latest"
DOMAIN=""
MODE=""
ROOT_EMAIL=""
IMAGE=""
BUNDLE_FILES="compose.yml Caddyfile osmcp searxng-entrypoint.sh updater/Dockerfile updater/updater.sh"

die() { echo "install.sh: $*" >&2; exit 1; }
say() { echo "==> $*"; }

usage() {
  cat <<'USAGE'
Usage: install.sh --domain HOST --mode org|solo [options]

  --domain HOST        Address people open, e.g. osmcp.example.com. Its DNS must point here.
  --mode org|solo      org: one organization with an owner and admins. solo: individual accounts.
  --root-email EMAIL   org only: the NetSuite user who becomes the owner on first sign-in.
  --version VERSION    Release to install, e.g. 5.10.0 (default: latest)
  --dir PATH           Install directory (default: /opt/opensuitemcp)
  --image NAME         Image without a tag (default: ghcr.io/unstackedapps/opensuitemcp)
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --root-email) ROOT_EMAIL="$2"; shift 2 ;;
    --version) VERSION="${2#v}"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "unknown option $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "run as root (sudo bash install.sh ...)"

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (docker compose version failed)"
systemctl enable --now docker >/dev/null 2>&1 || true

# 2. Release
if [ "$VERSION" = "latest" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -n1)"
  [ -n "$VERSION" ] || die "could not read the latest release from GitHub; pass --version"
fi
say "Installing OpenSuiteMCP $VERSION into $DIR"

# 3. Bundle: copied from beside this script when present, else downloaded at the release tag.
mkdir -p "$DIR"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
for f in $BUNDLE_FILES; do
  mkdir -p "$DIR/$(dirname "$f")"
  if [ -n "$SRC" ] && [ -f "$SRC/$f" ] && [ "$SRC" != "$DIR" ]; then
    cp "$SRC/$f" "$DIR/$f"
  elif [ "$SRC" != "$DIR" ] || [ ! -f "$DIR/$f" ]; then
    curl -fsSL "https://raw.githubusercontent.com/$REPO/v$VERSION/deploy/$f" -o "$DIR/$f"
  fi
done
chmod 755 "$DIR/osmcp"
ln -sf "$DIR/osmcp" /usr/local/bin/osmcp
# The app (uid 1001) and the updater share this folder.
mkdir -p "$DIR/control"
chown 1001:1001 "$DIR/control"
chmod 775 "$DIR/control"

# 4. Settings and secrets, written once.
ENV_FILE="$DIR/.env"
if [ -f "$ENV_FILE" ]; then
  say "Keeping the existing $ENV_FILE"
  sed -i "s|^OSMCP_VERSION=.*|OSMCP_VERSION=$VERSION|" "$ENV_FILE"
  grep -q '^OSMCP_DIR=' "$ENV_FILE" || echo "OSMCP_DIR=$DIR" >> "$ENV_FILE"
else
  [ -n "$DOMAIN" ] || die "--domain is required"
  case "$MODE" in
    org) [ -n "$ROOT_EMAIL" ] || die "--root-email is required with --mode org" ;;
    solo) ;;
    *) die "--mode must be org or solo" ;;
  esac
  say "Writing $ENV_FILE"
  umask 077
  cat > "$ENV_FILE" <<ENV
# OpenSuiteMCP settings. osmcp and Docker Compose both read this file.
OSMCP_VERSION=$VERSION
OSMCP_DIR=$DIR
OSMCP_DOMAIN=$DOMAIN
OSMCP_INSTALL_MODE=$MODE
OSMCP_ROOT_EMAIL=$ROOT_EMAIL
${IMAGE:+OSMCP_IMAGE=$IMAGE}

# Generated secrets. Changing ENCRYPTION_KEY makes stored API keys and NetSuite tokens unreadable.
AUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
ENV
  umask 022
fi

# 5. DNS check: Let's Encrypt fails when the domain points elsewhere.
DOMAIN="$(grep -E '^OSMCP_DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"
PUBLIC_IP="$(curl -fsS --max-time 5 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)"
RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -n "$PUBLIC_IP" ] && [ "$RESOLVED" != "$PUBLIC_IP" ]; then
  echo "WARNING: $DOMAIN resolves to '${RESOLVED:-nothing}', but this server's public IP is $PUBLIC_IP."
  echo "         The certificate request fails until the DNS A record points here."
fi

# 6. Start
say "Starting containers (the first start pulls images and migrates the database)"
docker compose --project-directory "$DIR" -f "$DIR/compose.yml" up -d --build --pull missing

say "Waiting for the app to answer"
for _ in $(seq 1 84); do
  state="$(osmcp compose ps --format '{{.Health}}' app 2>/dev/null || true)"
  [ "$state" = "healthy" ] && break
  sleep 5
done
[ "$state" = "healthy" ] || die "the app did not become healthy. Check: osmcp logs app"

echo
echo "OpenSuiteMCP $VERSION is running at https://$DOMAIN"
if grep -q '^OSMCP_INSTALL_MODE=org' "$ENV_FILE"; then
  echo "Sign in as $(grep -E '^OSMCP_ROOT_EMAIL=' "$ENV_FILE" | cut -d= -f2-) on https://$DOMAIN/setup to become the owner."
else
  echo "Create your account on https://$DOMAIN/login."
fi
echo "Manage it with: osmcp status | osmcp update | osmcp logs app"
