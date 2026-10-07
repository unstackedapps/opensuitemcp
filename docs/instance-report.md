# Instance report

A read-only JSON report for whoever operates this instance: version, usage counts, NetSuite connection health and recent server errors. Counts only: no message text, no emails, no names. Off unless you set a token.

## Turn it on

1. Generate a token of at least 32 characters:

   ```bash
   openssl rand -hex 32
   ```

2. Set `OSMCP_INSTANCE_REPORT_TOKEN` to it in the app's environment, then restart the app.
3. Give your operator the report URL, `https://<your host>/api/instance/report`, and the token.

**Check your work:**

```bash
curl -H "Authorization: Bearer <token>" https://<your host>/api/instance/report
```

A `404` means the token is unset or shorter than 32 characters. A `401` means the token sent does not match.

**Afterward:** to change who can read the report, replace the token and restart. To turn it off, remove the variable and restart.

## What it contains

| Field | Contents |
|---|---|
| `app` | Version, install mode (`solo` or `org`), Node version, when the process started |
| `users` | Total, disabled, new in 30 days, signed in within 7 and 30 days |
| `orgs` | Number of organizations |
| `activity` | Messages people sent in 24 hours and 7 days, active users, runs and failed runs, tool errors — all over 7 days |
| `netsuite` | Users connected, saved accounts, accounts with no token, tokens refreshed in 7 days |
| `agentApps` | API keys and OAuth apps not revoked, and how many were used in 7 days |
| `aiProviders` | Users with each provider type, and org-wide providers that are enabled |
| `errors` | Up to the 50 most recent server errors: time, `request` or `log`, method and path without the query string, message cut to 300 characters |
| `database` | Migrations applied, and when the latest ran |

- **A NetSuite account with no token needs connecting again.** The app deletes a token when its refresh fails.
- **Activity counts only messages still stored.** Chats an instance deletes take their messages with them.
- **The error list lives in memory.** A restart empties it; `errors.since` says when the current one began.
- **`reportVersion` changes when a field changes meaning or is removed.** It is `1`.
