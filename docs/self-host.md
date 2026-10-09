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

## How an update runs

1. `osmcp update` backs up the database to `backups/`.
2. It pulls `ghcr.io/unstackedapps/opensuitemcp:<version>` and restarts the app on it.
3. The app migrates the database as it starts.
4. `osmcp` waits up to 7 minutes for the app to answer.
5. If the app never answers, `osmcp` restores the backup and starts the previous version again.

`update-status.json` records the result of the last update. A failed start leaves its log in `logs/`.

`osmcp rollback` after a **successful** update loses anything saved since that update. It asks you to type the version before it runs.

## Files

Everything lives in `/opt/opensuitemcp`.

| File | Holds |
|---|---|
| `.env` | Version, domain, install mode and generated secrets |
| `compose.yml` | The containers: app, Postgres, Redis, SearXNG and Caddy |
| `Caddyfile` | The HTTPS proxy. Caddy gets the certificate from Let's Encrypt |
| `backups/` | Database backups. The newest 10 are kept |

**Back up `.env` somewhere else.** `ENCRYPTION_KEY` in it decrypts stored API keys and NetSuite tokens; a database backup is unreadable without it.

## Settings in `.env`

| Variable | Set by | Change it to |
|---|---|---|
| `OSMCP_VERSION` | `osmcp update` | Use `osmcp update` instead |
| `OSMCP_DOMAIN` | `--domain` | Move to another domain, then run `osmcp compose up -d` |
| `OSMCP_INSTALL_MODE` | `--mode` | Never; it decides how people sign in |
| `OSMCP_ROOT_EMAIL` | `--root-email` | Name a different first owner before anyone signs in |
| `OSMCP_INSTANCE_REPORT_TOKEN` | You | Turn on the [instance report](instance-report.md) |

Every other variable in the [README](../README.md#install-environment-variables) can go in `.env` too. Run `osmcp compose up -d app` after editing it.
