#!/bin/bash
set -euxo pipefail

DOMAIN='{{DOMAIN}}'
EXPECTED_IP='{{EIP}}'
REGION='{{AWS_REGION}}'
APP_IMAGE='{{APP_IMAGE}}'
SEARXNG_IMAGE='{{SEARXNG_IMAGE}}'
AUTH_SECRET_ARN='{{AUTH_SECRET_ARN}}'
ENCRYPTION_KEY_ARN='{{ENCRYPTION_KEY_ARN}}'
POSTGRES_SECRET_ARN='{{POSTGRES_SECRET_ARN}}'
REDIS_SECRET_ARN='{{REDIS_SECRET_ARN}}'
BASIC_AUTH_SECRET_ARN='{{BASIC_AUTH_SECRET_ARN}}'
BASIC_AUTH_ENABLED_PARAMETER_NAME='{{BASIC_AUTH_ENABLED_PARAMETER_NAME}}'

dnf install -y docker xfsprogs
systemctl enable --now docker

curl -fsSL "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-x86_64" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

DATA_DEV=""
for _ in $(seq 1 60); do
  if [ -e /dev/xvdf ]; then
    DATA_DEV=/dev/xvdf
    break
  fi
  if [ -e /dev/nvme1n1 ]; then
    DATA_DEV=/dev/nvme1n1
    break
  fi
  sleep 2
done
if [ -z "$DATA_DEV" ]; then
  echo "Data volume device not found"
  exit 1
fi
if ! blkid "$DATA_DEV" >/dev/null 2>&1; then
  mkfs.xfs "$DATA_DEV"
fi
mkdir -p /data
mount "$DATA_DEV" /data
if ! grep -q ' /data ' /etc/fstab; then
  echo "$DATA_DEV /data xfs defaults,nofail 0 2" >> /etc/fstab
fi
mkdir -p /data/postgres /data/redis /data/caddy /data/caddy-config

TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
for _ in $(seq 1 60); do
  CURRENT=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/public-ipv4 || true)
  if [ "$CURRENT" = "$EXPECTED_IP" ]; then
    break
  fi
  sleep 5
done

AUTH_SECRET=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id "$AUTH_SECRET_ARN" --query SecretString --output text)
ENCRYPTION_KEY=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id "$ENCRYPTION_KEY_ARN" --query SecretString --output text)
POSTGRES_PASSWORD=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id "$POSTGRES_SECRET_ARN" --query SecretString --output text)
REDIS_PASSWORD=$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id "$REDIS_SECRET_ARN" --query SecretString --output text)

mkdir -p /opt/opensuitemcp
echo '{{COMPOSE_B64}}' | base64 -d > /opt/opensuitemcp/compose.yml
echo '{{CADDY_B64}}' | base64 -d > /opt/opensuitemcp/Caddyfile
echo '{{SYNC_BASIC_AUTH_B64}}' | base64 -d > /opt/opensuitemcp/sync-basic-auth.sh
chmod 700 /opt/opensuitemcp/sync-basic-auth.sh

cat > /opt/opensuitemcp/basic-auth.env <<EOF
AWS_REGION=${REGION}
BASIC_AUTH_SECRET_ARN=${BASIC_AUTH_SECRET_ARN}
BASIC_AUTH_ENABLED_PARAMETER_NAME=${BASIC_AUTH_ENABLED_PARAMETER_NAME}
EOF
chmod 600 /opt/opensuitemcp/basic-auth.env

cat > /opt/opensuitemcp/.env <<EOF
APP_IMAGE=${APP_IMAGE}
SEARXNG_IMAGE=${SEARXNG_IMAGE}
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
EOF

cat > /opt/opensuitemcp/app.env <<EOF
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
AUTH_TRUST_HOST=true
AUTH_URL=https://${DOMAIN}
NEXTAUTH_URL=https://${DOMAIN}
AUTH_SECRET=${AUTH_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
POSTGRES_USER=opensuitemcp
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=opensuitemcp
POSTGRES_SSLMODE=disable
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}
SEARXNG_ENDPOINT=http://searxng:8080
ORACLE_SKILLS_DIR=/app/.data/oracle-skills
EOF
chmod 600 /opt/opensuitemcp/.env /opt/opensuitemcp/app.env

REGISTRY=$(echo "$APP_IMAGE" | cut -d/ -f1)
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

cd /opt/opensuitemcp
docker-compose --env-file /opt/opensuitemcp/.env -f /opt/opensuitemcp/compose.yml pull

set -a
# shellcheck disable=SC1091
source /opt/opensuitemcp/basic-auth.env
set +a
/opt/opensuitemcp/sync-basic-auth.sh

docker-compose --env-file /opt/opensuitemcp/.env -f /opt/opensuitemcp/compose.yml up -d

cat > /etc/systemd/system/opensuitemcp.service <<'UNIT'
[Unit]
Description=OpenSuiteMCP
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/opensuitemcp
ExecStart=/usr/local/bin/docker-compose --env-file /opt/opensuitemcp/.env -f /opt/opensuitemcp/compose.yml up -d
ExecStop=/usr/local/bin/docker-compose --env-file /opt/opensuitemcp/.env -f /opt/opensuitemcp/compose.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
UNIT
systemctl enable opensuitemcp.service

cat > /etc/systemd/system/opensuitemcp-basic-auth.service <<'UNIT'
[Unit]
Description=Sync OpenSuiteMCP HTTP basic auth from SSM
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/opensuitemcp
EnvironmentFile=/opt/opensuitemcp/basic-auth.env
ExecStart=/opt/opensuitemcp/sync-basic-auth.sh
UNIT

cat > /etc/systemd/system/opensuitemcp-basic-auth.timer <<'UNIT'
[Unit]
Description=Refresh OpenSuiteMCP HTTP basic auth setting

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=15s

[Install]
WantedBy=timers.target
UNIT
systemctl enable --now opensuitemcp-basic-auth.timer
