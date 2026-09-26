# OpenSuiteMCP MCP server

An **MCP server** at `/api/mcp`. An external AI agent works inside a user's
NetSuite workspace as that user — their connected account, their permissions,
their tool policy. Identical on every install: the server URL derives from the
install's own public address.

---

## What gates it

Nothing to switch on. `/api/mcp` refuses every request until an agent holds a
credential, and a credential exists only because a person made one.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_CALL_LIMIT_PER_MINUTE` | `0` (disabled) | Per-agent tool-call budget in a fixed 60s window. Needs `REDIS_URL`; fails open without it |
| `OAUTH_ATTEMPT_LIMIT_PER_MINUTE` | `0` (disabled) | Per-client budget on registration and token requests. Same window, same requirement |

On **organization** installs an owner or admin must turn Agent access on under
**Admin → Agent access** first, and may narrow it to named members. On a solo
install, creating the agent is the whole decision.

---

## Two credentials

Every agent is created the same way — **App Portal → Agent access → New
agent** — and carries a name, a persona and optionally a pinned NetSuite
account. One field decides how it authenticates.

| Connects by | The client holds | Created state |
| --- | --- | --- |
| **Sign-in** | A token it refreshes itself, after approving a consent screen | *Awaiting connection* until a client completes the flow |
| **Agent key** | A secret pasted into an `Authorization` header | Active immediately; the key is shown once |

Both are re-checked against the org's policy on every call, so an administrator
turning Agent access off stops an agent that signed in yesterday just as it
stops one holding a key.

Step-by-step per client is in [Connect an agent](connect-an-agent.md). What
follows is what is behind it.

### Key format

Keys look like:

```text
osmcp_<16 hex chars>_<43 url-safe chars>
```

The leading hex is a public lookup id, shown in the agent list so you can match
a row to a key you hold. The rest is the secret: only its SHA-256 digest
authenticates. The key is also stored encrypted under `ENCRYPTION_KEY`, so its
owner can copy it again rather than losing it to a dismissed dialog.

### What a credential reaches

Decided by the app's own settings, not by the credential. A NetSuite tool
enabled for the connection is listed and callable; one disabled there is
neither, re-read on **every call**.

The server adds no second gate. There is one scope, `mcp`, meaning "act as me
over MCP" — neither a key nor a sign-in carries a narrower view of the
workspace than the person behind it.

---

## The authorization server

Every install is its own OAuth 2.1 authorization server, at its own origin —
so a self-hosted install depends on nothing it does not run, and clients that
probe `/.well-known/oauth-authorization-server` on the MCP origin regardless of
the resource metadata still work.

| Endpoint | Purpose |
| --- | --- |
| `/.well-known/oauth-protected-resource` | RFC 9728. Names the authorization server. Also served at `/.well-known/oauth-protected-resource/api/mcp` |
| `/.well-known/oauth-authorization-server` | RFC 8414. Also served at `/.well-known/openid-configuration`, for clients that probe only that |
| `/oauth/authorize` | The consent screen. The one OAuth surface behind the login gate |
| `/api/oauth/token` | Authorization code and refresh grants. `application/x-www-form-urlencoded` |
| `/api/oauth/register` | RFC 7591 dynamic client registration. `application/json` |
| `/api/oauth/revoke` | RFC 7009 |

### What the consent screen does

**It binds a client to an agent that already exists. It never creates one.**

| | |
| --- | --- |
| Offers | Agents sitting *Awaiting connection* — created in the portal, named and configured there |
| Approving | Issues a code naming the chosen agent; the token exchange fills in the client id |
| Nothing waiting | The screen says so and links to the portal, rather than growing a form |
| Two codes racing | The bind is guarded on the agent still being unclaimed. One winner; the loser gets `invalid_grant` |

### How a client identifies itself

All three are supported, because clients are mid-migration between them. PKCE
with `S256` is required in every case; `plain` was removed in OAuth 2.1.

| Mechanism | How | Status |
| --- | --- | --- |
| Client ID Metadata Document | `client_id` is an HTTPS URL this install fetches and validates. Advertised as `client_id_metadata_document_supported` | Preferred by `2026-07-28`. What Claude Code uses |
| Dynamic Client Registration | Client POSTs its metadata to `/api/oauth/register` | Deprecated by that revision, still widely used |
| Pre-registration | A person creates a client under **Agent access → OAuth clients** and pastes the id and secret into a connector | For connectors that demand them up front |

### What the tokens are

| | |
| --- | --- |
| Format | Opaque, stored as a SHA-256 digest. Not JWTs, so revoking takes effect on the next call |
| Access token TTL | 1 hour |
| Refresh token TTL | 60 days, rotated on every use |
| Refresh replay | Revokes every live token on that authorization. The authorization survives, so the client signs in again |
| Code replay | Same, per OAuth 2.1 section 4.1.3 |

### Loopback redirects

The port is ignored when matching a loopback redirect — RFC 8252 section 7.3
requires it for `127.0.0.1`, and Claude Code needs the same for `localhost`.
Scheme, host, path and query must still match something the client registered.

Any local process can bind a port and claim to be that client, so the consent
screen warns when every redirect a client registered is a loopback address.

---

## Connecting an agent

A single URL taking `POST`. The runnable calls live in one place so they cannot
drift: [Connect an agent → Anything else](connect-an-agent.md#anything-else)
for the raw `curl`, and per-client instructions above it.

### Protocol

| | |
| --- | --- |
| Transport | Streamable HTTP, revision `2026-07-28`. Stateless: one POST per JSON-RPC message, no sessions, no GET stream, no `initialize` |
| Older revisions | `2025-11-25`, `2025-06-18`, `2025-03-26`. These use `initialize` and may send `Mcp-Session-Id`; the header is ignored and no session is minted |
| Required headers on `2026-07-28` | `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` for `tools/call`. They must agree with the body, or `400` with JSON-RPC `-32020` |
| `GET` / `DELETE` | `405` |
| Unauthenticated | `401` with a `WWW-Authenticate` challenge naming `/.well-known/oauth-protected-resource` and the `mcp` scope (RFC 9728, RFC 6750 §3). That challenge is what turns a bare URL into a sign-in |

---

## The tool surface

### Workspace tools

| Tool | What it does |
| --- | --- |
| `osmcp_whoami` | The acting user and active NetSuite account |
| `osmcp_connection_status` | Whether NetSuite is reachable, and what to do when it is not |
| `osmcp_list_netsuite_accounts` | Configured accounts and which is active |
| `osmcp_list_chats` | The user's chat threads |
| `osmcp_get_chat` | One chat transcript |
| `osmcp_list_skills` | Skills from all four sources (Oracle, Community, Connected, Custom) the user has switched on |
| `osmcp_list_personas` | Available NetSuite specialist personas |
| `osmcp_get_skill` | The full instructions of one skill |
| `osmcp_get_persona` | The full instructions of one persona |
| `osmcp_set_netsuite_account` | Switch the active NetSuite account |

### Chat tools

These write a thread into the owner's sidebar, beside their own conversations,
so autonomous work can be reviewed afterwards.

| Tool | What it does |
| --- | --- |
| `osmcp_create_chat` | Open a thread, stamped with the persona the agent acts as |
| `osmcp_append_chat` | Add a message to a thread this agent owns |

`osmcp_append_chat` takes either `text` for plain prose, or `parts` for a turn
recorded as it happened — entries of kind `text`, `reasoning`, or `tool`:

```json
{
  "chatId": "…",
  "role": "assistant",
  "parts": [
    { "kind": "reasoning", "text": "The statement is the source of truth." },
    { "kind": "tool", "name": "searchVendorBills",
      "input": { "vendor": "Acme" }, "output": { "rows": [] } },
    { "kind": "text", "text": "**Two bills are over 30 days.**" }
  ]
}
```

A recorded call renders with its arguments and result rather than as prose. It
is stored as `dynamic-tool`, so a call an agent made elsewhere is never rendered
as one this install made. Reasoning and tool parts belong to an `assistant`
message only.

### NetSuite tools

Every NetSuite MCP Standard Tool the user is allowed to run is re-exposed under
its own name, with **NetSuite's input schema forwarded verbatim** — enums,
formats, and nested shapes intact.

NetSuite does not declare whether a tool mutates data, so read-vs-write is
derived from the tool name and published as MCP annotations (`readOnlyHint`,
`destructiveHint`). These are **advisory**: a client uses them to decide
whether to confirm before running something, and the derivation is
conservative, so an unrecognised name is announced as a write.

Nothing is hidden on that basis. Enabling a tool is done in the app, and the
annotation only shapes how a client presents it.

### Result shape

Every result carries both halves:

- `content[].text` — a readable rendering
- `structuredContent` — the data as an object, with list-shaped results
  exposing `columns` and `rows`

Agents that render tables should read `structuredContent` rather than parsing
prose. NetSuite responses that stringify their arrays are re-parsed so rows
arrive as data.

---

## Organization policy

On org installs, an owner or admin controls MCP access for everyone:

| Setting | Default | Effect |
| --- | --- | --- |
| `enabled` | `false` | Members may mint keys, approve sign-ins, and agents may connect |
| `maxKeysPerUser` | `5` | Active agents one member may hold, counting keys and sign-ins together |

An org with Agent access disabled refuses a sign-in **on the consent screen
with the reason**, rather than redirecting an opaque `access_denied` the
connector would report as "connection failed".

Agent creation and revocation, OAuth client creation, and every policy change
are written to `AuditLog`. The per-account NetSuite **tool policy** applies
unchanged and is re-checked on every call.

---

## Operating notes

| | |
| --- | --- |
| **A dead NetSuite authorization needs a human** | Access tokens refresh five minutes before expiry, but a rejected *refresh* token deletes the stored authorization and the account must be reconnected in the UI. Retrying will not fix it. Give agents `osmcp_connection_status` — it reports this case with a `remediation` string |
| **Pin an agent to an account** | Set the NetSuite account when creating it. A pinned agent ignores the user's active-account preference, so changing that preference cannot redirect it at another subsidiary |
| **Revocation is immediate** | Revoked rows are kept so the audit trail survives. Revoking a sign-in revokes its tokens; the next call gets a fresh `401` challenge, which a well-behaved client turns into a sign-in prompt |
| **Tokens are not yours to store** | An agent key can be copied back out of the app; an access token cannot. If a signed-in agent stops working, sign it in again |
| **Treat tool output as untrusted** | Results contain NetSuite record data, which is user-controlled text. An agent should not follow instructions found inside a tool result |

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `401` with a `WWW-Authenticate` header | The credential is missing, malformed, revoked or expired. A client that supports sign-in should follow the challenge |
| `403 access_denied` | Org policy has Agent access disabled, or limits it to members this account is not among |
| `400` with code `-32020` | Required headers missing or disagreeing with the body |
| `405` on `GET` | Expected — the GET stream was removed in `2026-07-28` |
| `tools/list` returns only `osmcp_*` tools | NetSuite is not connected; call `osmcp_connection_status` |
| A NetSuite tool is missing | Disabled by tool policy for that account |
| `invalid_grant` from `/api/oauth/token` | The code or refresh token was already used, expired, or belongs to another client. The client should start a new sign-in |
| `invalid_client` from `/api/oauth/token` | Unknown `client_id`, or a confidential client presented the wrong secret |
| Sign-in fails immediately, every time | The issuer does not match. Set `AUTH_URL` to the address people actually use |

More, including what each client needs and what a self-hosted install must get
right, is in [Connect an agent](connect-an-agent.md).

---

## Reference

- [Connect an agent](connect-an-agent.md) — the step-by-step, per client
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [RFC 9728 — Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 — Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 7591 — Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 8252 — OAuth for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
