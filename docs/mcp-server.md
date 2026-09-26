# OpenSuiteMCP MCP server

OpenSuiteMCP can act as an **MCP server**, letting an external AI agent work
inside a user's NetSuite workspace as that user — their connected account,
their permissions, their tool policy.

This is the mirror image of the app's usual role. Normally OpenSuiteMCP is an
MCP *client* talking to NetSuite. With this feature it is also a *server* that
something else talks to.

It works the same way on every install — self-hosted, sandbox, and hosted —
because the server URL derives from the install's own public address.

---

## What gates it

There is nothing to switch on. `/api/mcp` refuses every request until an agent
holds a credential, and a credential only exists because a person made one —
either by minting a key or by approving a sign-in. The feature is dormant on an
install nobody has used it on.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_CALL_LIMIT_PER_MINUTE` | `0` (disabled) | Per-agent tool-call budget in a fixed 60s window. Needs `REDIS_URL`; fails open without it |
| `OAUTH_ATTEMPT_LIMIT_PER_MINUTE` | `0` (disabled) | Per-client budget on registration and token requests. Same window, same requirement |

On **organization** installs an owner or admin must turn Agent access on under
**Admin → Agent access** before any member can mint a key, and may narrow it to
named members. A solo install is one person who is their own administrator, so
minting a key is the whole decision.

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

The leading hex is a public lookup id, also shown in the key list so you can
match a row to a key you hold. The rest is the secret. Only a SHA-256 digest of
it authenticates; the key is also stored encrypted under `ENCRYPTION_KEY` so its
owner can copy it again rather than losing it to a dismissed dialog.

### What a credential reaches

What an agent can reach is decided by the app's own settings, not by the
credential. A NetSuite tool left enabled for the connection is listed and
callable; one disabled there is neither, and the policy is re-read on **every
call**, so a tool disabled mid-session stops working immediately.

The server adds no second gate on top of that. Neither a key nor a sign-in
carries a narrower view of the workspace than the person behind it. There is one
scope, `mcp`, and it means "act as me over MCP".

---

## The authorization server

Every install is its own OAuth 2.1 authorization server, at its own origin. That
is partly principle — a self-hosted install must not depend on a service it does
not run — and partly interoperability: several clients probe
`/.well-known/oauth-authorization-server` on the MCP server's own origin
regardless of what the resource metadata says, and co-locating the two means the
flow works either way.

| Endpoint | Purpose |
| --- | --- |
| `/.well-known/oauth-protected-resource` | RFC 9728. Names the authorization server. Also served at `/.well-known/oauth-protected-resource/api/mcp` |
| `/.well-known/oauth-authorization-server` | RFC 8414. Also served at `/.well-known/openid-configuration`, for clients that probe only that |
| `/oauth/authorize` | The consent screen. The one OAuth surface behind the login gate |
| `/api/oauth/token` | Authorization code and refresh grants. `application/x-www-form-urlencoded` |
| `/api/oauth/register` | RFC 7591 dynamic client registration. `application/json` |
| `/api/oauth/revoke` | RFC 7009 |

### What the consent screen does

It binds a client to an agent that already exists. It never creates one.

An agent is made in the portal, named and configured there, and sits *Awaiting
connection*. `/oauth/authorize` offers the ones waiting; approving issues a code
naming the chosen agent, and the token exchange fills in the client id. If
nothing is waiting, the screen says so and offers a link to the portal rather
than a form.

The bind is guarded on the agent still being unclaimed, so two codes racing for
the same agent leave one winner; the loser's token request fails with
`invalid_grant`.

### How a client identifies itself

Three mechanisms, all supported, because clients are mid-migration between them:

- **Client ID Metadata Document** — the `client_id` is an HTTPS URL this install
  fetches and validates against itself. Preferred by revision `2026-07-28`, and
  what Claude Code uses. Advertised as `client_id_metadata_document_supported`.
- **Dynamic Client Registration** — the client POSTs its metadata to
  `/api/oauth/register`. Deprecated by that revision, still what several
  shipping clients do.
- **Pre-registration** — a person creates a client under **Agent access → OAuth
  clients** and pastes its id and secret into a connector that asks for them.

PKCE with `S256` is required in all three cases; `plain` was removed in OAuth
2.1 and is not accepted.

### What the tokens are

Access tokens are opaque and stored as a SHA-256 digest, not JWTs. Revoking an
agent therefore takes effect on its very next call rather than whenever a signed
token would have expired — the property a key already had, and the one an
unattended agent's owner actually wants.

Access tokens last an hour. Refresh tokens last sixty days and **rotate on every
use**: exchanging one invalidates it and issues a successor. Presenting a
refresh token that was already used revokes every live token on that
authorization, on the assumption that a replay is theft rather than a retry. The
authorization itself survives, so the client simply signs in again.

Replaying an authorization code does the same, per OAuth 2.1 section 4.1.3.

### Loopback redirects

A native client listens on an ephemeral port it cannot know when it publishes
its metadata, so the port is ignored when matching a loopback redirect — RFC
8252 section 7.3 requires this for `127.0.0.1`, and Claude Code needs the same
for `localhost`. Nothing else is relaxed: scheme, host, path and query must all
match something the client registered.

Because any local process can bind a port and claim to be that client, the
consent screen says so when every redirect a client registered is a loopback
address.

---

## Connecting an agent

The endpoint is a single URL taking `POST`:

```text
https://<your-install>/api/mcp
Authorization: Bearer <token>
```

For a client that takes a URL and a header — Claude Code, Cursor, VS Code,
Codex:

```bash
claude mcp add --transport http opensuitemcp https://your-install.example.com/api/mcp \
  --header "Authorization: Bearer osmcp_..."
```

Or, with no key at all, add the same URL and let the client sign you in. Both,
per client, are in [Connect an agent](connect-an-agent.md).

A raw check:

```bash
curl -sS https://your-install.example.com/api/mcp \
  -H "Authorization: Bearer osmcp_..." \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/list" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Protocol

The server implements Streamable HTTP revision **`2026-07-28`**, which is
stateless: one POST per JSON-RPC message, no sessions, no GET stream, no
`initialize` handshake. `GET` and `DELETE` return `405`.

Revisions `2025-11-25`, `2025-06-18`, and `2025-03-26` are also accepted, since
most clients in the field still speak them. Those clients use `initialize` and
may send `Mcp-Session-Id`; the header is ignored and no session is minted.

On `2026-07-28` the `MCP-Protocol-Version`, `Mcp-Method`, and — for
`tools/call` — `Mcp-Name` headers are required and must agree with the request
body. A mismatch returns `400` with JSON-RPC error `-32020`.

An unauthenticated request returns `401` with a `WWW-Authenticate` challenge
pointing at `/.well-known/oauth-protected-resource` and naming the `mcp` scope,
per RFC 9728 and RFC 6750 section 3. That challenge is what turns a bare URL
into a sign-in for a client that supports one.

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

An agent's work is invisible unless it says what it did. These write a thread
into its owner's sidebar, beside that person's own conversations, which is how
autonomous work is reviewed after the fact.

| Tool | What it does |
| --- | --- |
| `osmcp_create_chat` | Open a thread, stamped with the persona the key acts as |
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

A recorded call is shown the way this app shows its own, with its arguments and
its result, rather than described in prose. It is stored as `dynamic-tool`, so a
tool an agent ran in some other system is never rendered as one this install
made: a recorded `ns_` call is a report about NetSuite, not a call to it.
Reasoning and tool parts belong to an `assistant` message only.

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

The budget is shared deliberately: a key and a sign-in are the same thing to
whoever owns them, and a cap that only counted one of them would not be a cap.

An organization that has Agent access disabled refuses a sign-in at the consent
screen with the reason, rather than redirecting an opaque `access_denied` the
connector would report as "connection failed".

Key and authorization creation and revocation, OAuth client creation, and every
policy change, are written to `AuditLog`.

The existing per-account NetSuite MCP **tool policy** applies unchanged: a tool
an admin disabled for an account is not listed and cannot be called, and that
is re-checked on every call rather than trusted from list time.

---

## Operating notes

**A dead NetSuite authorization needs a human.** Access tokens refresh
automatically five minutes before expiry, but if the *refresh* token is
rejected the stored authorization is deleted and the account must be
reconnected in the UI. This is the main failure mode for an unattended agent:
retrying will not fix it. `osmcp_connection_status` reports this case
explicitly with a `remediation` string, so give agents that tool and instruct
them to call it when a NetSuite tool fails.

**Pin an agent to an account** when it should only ever touch one NetSuite
account — on the consent screen when it signs in, or when minting its key. A
pinned agent ignores the user's active-account preference, so changing that
preference in the UI cannot redirect it at another subsidiary.

**Revocation is immediate and permanent.** Revoked rows are kept so the audit
trail and last-used time survive. Revoking a sign-in also revokes its tokens,
and the agent's next call gets a fresh `401` challenge — which a well-behaved
client turns into a sign-in prompt rather than a silent failure.

**A client's tokens are not yours to store.** An agent key can be copied back
out of the app; an access token cannot, by design. If a signed-in agent stops
working, the answer is to sign it in again, not to recover anything.

**Treat tool output as untrusted.** Results contain NetSuite record data,
which is user-controlled text. An agent should not follow instructions that
appear inside a tool result.

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
