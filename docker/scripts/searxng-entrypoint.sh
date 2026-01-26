#!/bin/sh
set -e

# Step 1: Initialize settings.yml if it doesn't exist (replicate entrypoint logic)
SETTINGS_FILE=/etc/searxng/settings.yml
TEMPLATE_FILE=/usr/local/searxng/searx/settings.yml

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "Creating settings.yml from template..."
  cp -pfT "$TEMPLATE_FILE" "$SETTINGS_FILE"
  sed -i "s/ultrasecretkey/$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9')/g" "$SETTINGS_FILE"
fi

# Step 2: Set proper ownership
chown -R searxng:searxng /etc/searxng 2>/dev/null || true

# Step 3: Apply configuration modifications
if [ -f "$SETTINGS_FILE" ]; then
  # Enable JSON format
  sed -i 's/- html/- html\n    - json/' "$SETTINGS_FILE"
  # Enable Bing engine
  sed -i '/- name: bing/,/- name:/ s/disabled: true/disabled: false/' "$SETTINGS_FILE"
  echo "Configuration modifications applied."
fi

# Step 4: Update CA certificates and launch the application
update-ca-certificates
exec /usr/local/searxng/.venv/bin/granian searx.webapp:app

