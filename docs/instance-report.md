# Instance report

A read-only JSON report for whoever operates this instance: version, usage counts, NetSuite connection health and recent server errors. Counts only: no message text, no emails, no names. Off until a token is set.

## Turn it on

**Organization install**

**Navigate to:** Admin → Instance report

1. Click **Generate token**
2. Copy **Address** and **Token** from the dialog, and send both to your operator

The report answers at once. The token isn't shown again.

**Solo install**, or an install managed from the server:

1. Generate a token on the server:

   ```bash
   openssl rand -hex 32
   ```

2. Set `OSMCP_INSTANCE_REPORT_TOKEN` to it in `.env`, then restart the app (`sudo osmcp compose up -d app` on an install made with `deploy/install.sh`).
3. Send your operator the address, `https://<your host>`, and the token.

`OSMCP_INSTANCE_REPORT_TOKEN`, when set, replaces a token generated in the app.

**Check your work:**

```bash
curl -H "Authorization: Bearer <token>" https://<your host>/api/instance/report
```

A `404` means no token is set. A `401` means the token sent does not match.

**Afterward:** **Replace** on Admin → Instance report gives a new token and stops the old one. **Turn off** stops the report.

## What it contains

| Field | Contents |
|---|---|
| `app` | Version, install mode (`solo` or `org`), Node version, when the process started |
| `users` | Total, disabled, new in 30 days, signed in within 7 and 30 days |
| `orgs` | Number of organizations |
| `activity` | Messages people sent in 24 hours and 7 days, active users, runs and failed runs, tool errors, and tools agent apps called over MCP with how many failed — all over 7 days |
| `netsuite` | Users connected, saved accounts, accounts with no token, tokens refreshed in 7 days |
| `agentApps` | API keys and OAuth apps not revoked, and how many were used in 7 days |
| `aiProviders` | Users with each provider type, and org-wide providers that are enabled |
| `errors` | Up to the 50 most recent server errors: time, `request` or `log`, method and path without the query string, message cut to 300 characters |
| `database` | Migrations applied, and when the latest ran |
| `updates` | `updater` (`ready`, `offline`, or `none` for an install without one), the latest release, a requested version not yet started, the last update's outcome, and whether automatic updates and updates from the operator are on |

- **A NetSuite account with no token needs connecting again.** The app deletes a token when its refresh fails.
- **Activity counts only messages still stored.** Chats an instance deletes take their messages with them.
- **The error list lives in memory.** A restart empties it; `errors.since` says when the current one began.
- **`reportVersion` changes when a field changes meaning or is removed.** It is `1`.

## Let your operator update this install

Needs an install made with `deploy/install.sh`, which runs the updater. See [Self-host reference](self-host.md).

**Organization install**

**Navigate to:** Admin → App updates

1. Turn on **Updates from your operator**

**Solo install**

**Navigate to:** Settings → General

1. Turn on **Updates from your operator**

Your operator then starts an update with the same token:

```bash
curl -X POST -H "Authorization: Bearer <token>" https://<your host>/api/instance/update
```

- **The body is optional.** `{"version": "5.10.0"}` names a release; without it, the latest release installs.
- **A `202` returns the version asked for.** The report's `updates.lastRun` shows how it went.
- **A `403` means the switch is off.** A `409` means the install has no updater, or it isn't running.
