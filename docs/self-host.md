# Self-host reference

For an install made with `deploy/install.sh`. On AWS, start with [Deploy on AWS](deploy-aws.md).

## Server requirements

| Need | Minimum |
|---|---|
| OS | Linux with Docker, or Ubuntu/Debian (the installer installs Docker) |
| CPU and memory | 2 vCPU, 4 GB |
| Disk | 30 GB |
| Inbound ports | 80 and 443 from anywhere; 22 for SSH |
| Outbound | HTTPS to GitHub, ghcr.io, NetSuite and your LLM provider |
| DNS | An A record from your domain to the server |

## Commands

Run each with `sudo` on the server.

| Command | Does |
|---|---|
| `osmcp status` | Version, address, app health, and each container's state |
| `osmcp update` | Backs up the database, then moves to the latest release |
| `osmcp update 5.10.0` | Same, to a named release |
| `osmcp rollback` | Returns to the version before the last update and restores its backup |
| `osmcp backup` | Writes a database backup to `backups/` |
| `osmcp restore FILE` | Replaces the database with a backup file |
| `osmcp logs app` | Last 200 lines of the app's log. Add `-f` to follow |
| `osmcp restart` | Restarts every container |
| `osmcp compose ARGS` | Runs any `docker compose` command against this install |

## Update from the app

| Install | Where |
|---|---|
| Organization | **Admin → App updates**, for owners and admins |
| Solo | **Settings → General** |

- **Update to `<version>`** installs the latest release now. The app restarts, then the page reloads.
- **Automatic updates** installs each new release at 03:00 UTC. Set `OSMCP_AUTO_UPDATE_HOUR` in `.env` to use a different hour.
- **Updates from your operator** appears once the instance report has a token. See [Instance report](instance-report.md#let-your-operator-update-this-install).

The `updater` container does the work. It runs the same `osmcp update` as the command line.

## How an update runs

1. `osmcp update` pulls `ghcr.io/unstackedapps/opensuitemcp:<version>`.
2. It backs up the database to `backups/`.
3. It replaces `compose.yml`, `Caddyfile`, `osmcp` and `updater/` with the release's copies.
4. It restarts the app on the new version. The app migrates the database as it starts.
5. It waits up to 7 minutes for the app to answer.
6. If the app never answers, `osmcp` puts back the previous files, restores the backup, and starts the previous version.

`control/status.json` records the result of the last update. A failed start leaves its log in `logs/`.

`osmcp rollback` after a **successful** update loses anything saved since that update. It asks you to type the version before it runs.

## Files

Everything lives in `/opt/opensuitemcp`.

| File | Holds |
|---|---|
| `.env` | Version, domain, install mode and generated secrets |
| `compose.yml` | The containers: app, Postgres, Redis, SearXNG, Caddy and the updater |
| `Caddyfile` | The HTTPS proxy. Caddy gets the certificate from Let's Encrypt |
| `updater/` | The updater container's image and script |
| `control/` | Shared by the app and the updater: update requests, the last result, and the update settings |
| `backups/` | Database backups. The newest 10 are kept |

**Back up `.env` somewhere else.** `ENCRYPTION_KEY` in it decrypts the API keys and NetSuite tokens stored in the database. Without it, those values in a backup can't be read.

**The updater holds the Docker socket,** which gives it control of every container on the server. It publishes no port. The app reaches it only through `control/`.

## Settings in `.env`

| Variable | Set by | Change it to |
|---|---|---|
| `OSMCP_VERSION` | `osmcp update` | Use `osmcp update` instead |
| `OSMCP_DOMAIN` | `--domain` | Move to another domain, then run `osmcp compose up -d` |
| `OSMCP_INSTALL_MODE` | `--mode` | Never; it decides how people sign in |
| `OSMCP_ROOT_EMAIL` | `--root-email` | Name a different first owner before anyone signs in |
| `OSMCP_INSTANCE_REPORT_TOKEN` | You | Turn on the [instance report](instance-report.md) on a solo install. An org install uses **Admin → Instance report** instead |
| `OSMCP_AUTO_UPDATE_HOUR` | You | Install automatic updates in a different hour, 0–23 UTC. Then run `osmcp compose up -d` |

Every other variable in the [README](../README.md#install-environment-variables) can go in `.env` too. Run `osmcp compose up -d app` after editing it.
