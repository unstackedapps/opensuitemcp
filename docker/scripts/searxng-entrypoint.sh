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
  # Enable JSON format (idempotent — template ships html-only)
  if ! grep -q '^    - json$' "$SETTINGS_FILE"; then
    sed -i 's/- html/- html\n    - json/' "$SETTINGS_FILE"
  fi
  # Enable Bing engine
  sed -i '/- name: bing/,/- name:/ s/disabled: true/disabled: false/' "$SETTINGS_FILE"
  # Wikidata processor is not registered in this image; enabled template breaks all searches
  if grep -q '^  - name: wikidata$' "$SETTINGS_FILE"; then
    if sed -n '/^  - name: wikidata$/,/^  - name: /p' "$SETTINGS_FILE" | grep -q 'disabled: true'; then
      : # already disabled
    elif sed -n '/^  - name: wikidata$/,/^  - name: /p' "$SETTINGS_FILE" | grep -q 'disabled: false'; then
      sed -i '/^  - name: wikidata$/,/^  - name: / s/disabled: false/disabled: true/' "$SETTINGS_FILE"
    else
      sed -i '/^  - name: wikidata$/a\    disabled: true' "$SETTINGS_FILE"
    fi
  fi
  echo "Configuration modifications applied."
fi

# Step 4: Update CA certificates and launch the application
update-ca-certificates
exec /usr/local/searxng/.venv/bin/granian searx.webapp:app

