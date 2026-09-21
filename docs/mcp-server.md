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

## Enabling it

The server is **off by default**, so upgrading never exposes a new network
surface without an operator choosing to.

```bash
# .env.local (or your production environment)
OSMCP_MCP_SERVER_ENABLED=true
```

Restart the app. While it is off, `/api/mcp` returns `404` and no API key
works.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OSMCP_MCP_SERVER_ENABLED` | unset (off) | Master switch for the whole feature |
| `MCP_CALL_LIMIT_PER_MINUTE` | `0` (disabled) | Per-key tool-call budget in a fixed 60s window. Needs `REDIS_URL`; fails open without it |

On **organization** installs there is a second gate: an owner or admin must
turn MCP access on for the org before any member can mint a key. Solo installs
have no second gate.

---

## Creating a key

In the app, open the **App Portal → API access**.

1. Copy the **Server URL** shown there.
2. Name a key after the agent that will hold it (`34five Aura — AP review`).
3. Leave **Allow writes** off unless the agent genuinely needs to change
   NetSuite records.
4. Create it, then **copy the key immediately** — it is shown once and is not
   recoverable. Only a SHA-256 digest of its secret half is stored.

Keys look like:

```text
osmcp_<16 hex chars>_<43 url-safe chars>
```

The leading hex is a public lookup id, also shown in the key list so you can
match a row to a key you hold. The rest is the secret.

### Scopes

| Scope | What it permits |
| --- | --- |
| `read` | Discovery and every non-mutating tool. Always present. |
| `write` | Additionally, NetSuite tools that create, update, or delete records. |

Scopes are enforced **on every request**, not just at mint time. If an
administrator later revokes write access for the organization, keys already
issued downgrade to read-only on their next call.

A tool a key lacks scope for is not listed and, if called by name, reports as
unknown rather than forbidden — so an error never confirms a capability the
caller may not use.

---

## Connecting an agent

The endpoint is a single URL taking `POST`:

```text
https://<your-install>/api/mcp
Authorization: Bearer osmcp_...
```

For a client that takes a URL and a header — Claude Code, Cursor, VS Code,
Codex:

```bash
claude mcp add --transport http opensuitemcp https://your-install.example.com/api/mcp \
  --header "Authorization: Bearer osmcp_..."
```

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
pointing at `/.well-known/oauth-protected-resource`, per RFC 9728.

---

## The tool surface

### Workspace tools

| Tool | Scope | What it does |
| --- | --- | --- |
| `osmcp_whoami` | `read` | The acting user, key scopes, and active NetSuite account |
| `osmcp_connection_status` | `read` | Whether NetSuite is reachable, and what to do when it is not |
| `osmcp_list_netsuite_accounts` | `read` | Configured accounts and which is active |
| `osmcp_list_chats` | `read` | The user's chat threads |
| `osmcp_get_chat` | `read` | One chat transcript |
| `osmcp_list_skills` | `read` | Oracle and Community skill packs and which are enabled |
| `osmcp_list_personas` | `read` | Available NetSuite specialist personas |

### NetSuite tools

Every NetSuite MCP Standard Tool the user is allowed to run is re-exposed under
its own name, with **NetSuite's input schema forwarded verbatim** — enums,
formats, and nested shapes intact.

Whether a NetSuite tool needs `write` is derived from its name, because
NetSuite does not declare it. The classifier is **fail-closed**: a name that is
not clearly a read requires `write`. A read-only key therefore never causes a
record change, at the cost of occasionally hiding a harmless tool.

Every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`), so a
client that filters by them sees an accurate picture.

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
| `enabled` | `false` | Members may mint keys and agents may connect |
| `allowWriteScope` | `false` | Members may mint keys carrying `write` |
| `maxKeysPerUser` | `5` | Active keys one member may hold |

Key creation and revocation, and every policy change, are written to
`AuditLog`.

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

**Pin a key to an account** when an agent should only ever touch one NetSuite
account. A pinned key ignores the user's active-account preference, so changing
that preference in the UI cannot redirect the agent at another subsidiary.

**Revocation is immediate and permanent.** Revoked rows are kept so the audit
trail and last-used time survive.

**Treat tool output as untrusted.** Results contain NetSuite record data,
which is user-controlled text. An agent should not follow instructions that
appear inside a tool result.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `404` from `/api/mcp` | `OSMCP_MCP_SERVER_ENABLED` is not `true` |
| `401` with a `WWW-Authenticate` header | Key missing, malformed, revoked, or expired |
| `403 access_denied` | Org policy has MCP access disabled |
| `400` with code `-32020` | Required headers missing or disagreeing with the body |
| `405` on `GET` | Expected — the GET stream was removed in `2026-07-28` |
| `tools/list` returns only `osmcp_*` tools | NetSuite is not connected; call `osmcp_connection_status` |
| A NetSuite tool is missing | Disabled by tool policy, or it needs `write` and the key is read-only |

---

## Reference

- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [RFC 9728 — Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
