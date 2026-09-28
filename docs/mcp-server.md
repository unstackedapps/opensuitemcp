# OpenSuiteMCP MCP server

An **MCP server** at `/api/mcp`. An external AI agent works inside a user's
NetSuite workspace as that user — their connected account, their permissions,
their tool policy. Identical on every install: the server URL derives from the
install's own public address.

---

## What gates it

Nothing to switch on. `/api/mcp` refuses every request until an app holds a
credential.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_CALL_LIMIT_PER_MINUTE` | `0` (disabled) | Per-app tool-call budget in a fixed 60s window. Needs `REDIS_URL`; fails open without it |
| `OAUTH_ATTEMPT_LIMIT_PER_MINUTE` | `0` (disabled) | Per-client budget on registration and token requests. Same window, same requirement |

On **organization** installs an owner or admin must turn Agent apps on under
**Admin → Agent apps** first, and may narrow it to named members. On a solo
install, creating the app is the whole decision.

---

## Credentials

Creating an app and choosing between OAuth 2.1 and bearer auth is in
[Connect an agent](connect-an-agent.md). This page is what sits behind it.

Either credential is re-checked against the org's policy on every call, so
disabling Agent apps stops an app that signed in yesterday as surely as one
holding a token.

### Bearer token format

Keys look like:

```text
osmcp_<16 hex chars>_<43 url-safe chars>
```

| Part | What it is |
| --- | --- |
| Leading hex | A public lookup id, shown in the app list so you can match a row to a token you hold |
| The rest | The secret. Only its SHA-256 digest authenticates |
| Copy-back | Stored encrypted under `ENCRYPTION_KEY`, so its owner can copy it again |

### What a credential reaches

| Question | Answer |
| --- | --- |
| Decided by | The app's own settings, not the credential |
| A tool disabled there | Neither listed nor callable, re-read on **every call** |
| Scopes | One, `mcp`: act as me over MCP. No credential carries a narrower view than the person behind it |

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

**It binds a client to an app that already exists. It never creates one.**

| Step | What happens |
| --- | --- |
| Offers | Agents sitting *Awaiting connection* — created in the portal, named and configured there |
| Approving | Issues a code naming the chosen app; the token exchange fills in the client id |
| Nothing waiting | The screen links to the portal |
| Two codes racing | The bind is guarded on the app still being unclaimed. One winner; the loser gets `invalid_grant` |

### How a client identifies itself

All three are supported, because clients are mid-migration between them. PKCE
with `S256` is required in every case; `plain` was removed in OAuth 2.1.

| Mechanism | How | Status |
| --- | --- | --- |
| Client ID Metadata Document | `client_id` is an HTTPS URL this install fetches and validates. Advertised as `client_id_metadata_document_supported` | Preferred by `2026-07-28`. What Claude Code uses |
| Dynamic Client Registration | Client POSTs its metadata to `/api/oauth/register` | Deprecated by that revision, still widely used |
| Pre-registration | The agent app issues an ID and secret when it is created, bound to that app | For connectors that demand them up front, such as Gemini |

### What the tokens are

| Property | Value |
| --- | --- |
| Format | Opaque, stored as a SHA-256 digest. Not JWTs, so revoking takes effect on the next call |
| Access token TTL | 1 hour |
| Refresh token TTL | 60 days, rotated on every use |
| Refresh replay | Revokes every live token on that authorization. The authorization survives, so the client signs in again |
| Code replay | Same, per OAuth 2.1 section 4.1.3 |

### Redirect URIs

| Shape | Matching |
| --- | --- |
| `https://…` | Exact |
| `http://` on loopback | Port ignored, per RFC 8252 §7.3. Scheme, host, path and query must still match |
| Private-use scheme, e.g. `cursor://…` | Exact, per RFC 8252 §7.1 |

`javascript:`, `data:`, `vbscript:`, `file:`, `blob:` and `about:` are refused —
an authorization code is appended to whatever the server redirects to.

Any local process can bind a port or register a scheme handler and claim to be
the client, so the consent screen warns when every redirect a client
registered points back at this machine.

---

## The endpoint

A single URL taking `POST`. Setup is in
[Connect an agent](connect-an-agent.md).

### Protocol

| Topic | Detail |
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
| `osmcp_list_skills` | Skills from all four sources (Oracle, Community, Connected, Custom) the user has switched on, each with `mode`, `authoredBy`, `managedByOrg` and the personas `carriedBy` |
| `osmcp_list_personas` | Available NetSuite specialist personas, each with the `skillIds` it carries |
| `osmcp_get_skill` | The full instructions of one skill |
| `osmcp_get_persona` | The full instructions of one persona |
| `osmcp_set_netsuite_account` | Switch the active NetSuite account |

### Chat tools

These write a thread into the owner's sidebar, so autonomous work can be
reviewed afterwards.

| Tool | What it does |
| --- | --- |
| `osmcp_create_chat` | Open a thread, stamped with the persona the app acts as |
| `osmcp_append_chat` | Add a message to a thread this app owns |

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

A recorded call renders with its arguments and result. It is stored as
`dynamic-tool`, so a call made elsewhere is never rendered as one this install
made. Reasoning and tool parts belong to an `assistant` message only.

### Persona and skill tools

A persona is a specialist playbook — role, domains, risk posture, approach. A
skill is the practice that specialist works by. Both are written into the
user's own library and appear in their Personas and Skills panels.

| Tool | What it does |
| --- | --- |
| `osmcp_create_persona` | Write a persona, with `adopt` to become it in the same call |
| `osmcp_clone_persona` | Copy any readable persona into an agent-authored one |
| `osmcp_update_persona` | Revise a persona this app wrote |
| `osmcp_delete_persona` | Remove a persona this app wrote, releasing the skills it carried |
| `osmcp_set_agent_persona` | Assign a persona to this connection, or omit `personaId` to return to Ava |
| `osmcp_create_skill` | Write a skill, with `mode` and `pairWith` |
| `osmcp_clone_skill` | Copy any readable skill into an agent-authored one |
| `osmcp_update_skill` | Revise a skill this app wrote |
| `osmcp_delete_skill` | Remove a skill this app wrote, releasing it from every persona carrying it |
| `osmcp_pair_skills` | Set the skills any persona carries |
| `osmcp_read_skill_file` | Read one reference file beside a skill's SKILL.md |

Five rules govern these:

| Rule | Detail |
| --- | --- |
| **An agent revises only its own work** | A persona or skill carries `authoredBy`. One a person wrote, or an organization administrator published, is read-only here |
| **Clone is how to build on someone else's** | `osmcp_clone_skill` and `osmcp_clone_persona` copy anything this user can read. The copy is agent-authored, so the agent may revise it |
| **A new skill starts at `slash`** | It applies when its owner types `/skill-name`, or when a persona carrying it is working. Pass `mode: "auto"` to apply it to every chat turn |
| **A persona carries its skills** | `osmcp_pair_skills` takes any persona, built-in or custom, and any skill from any source. In the OpenSuiteMCP app those skills are injected for every turn that persona works. Over this connection they are a reading list: `osmcp_get_persona` names them, and you read each with `osmcp_get_skill` |
| **A skill is a folder** | `SKILL.md` is the entry point. `osmcp_get_skill` returns it plus `files`, the reference material beside it; read one with `osmcp_read_skill_file` when SKILL.md points at it, rather than pulling them all in advance |

`description` is what an agent reads when choosing between skills, so write one
on every skill you create. `writtenBy` on `osmcp_list_skills` names the agent
that wrote it and the product it connected from.

A persona this user has made their default cannot be deleted by an agent.

Deleting one end of a pairing leaves the other in place: a deleted skill is
released from every persona that carried it, and a deleted persona releases its
skills without removing them.

### NetSuite tools

| Aspect | Detail |
| --- | --- |
| Naming | Every NetSuite MCP Standard Tool the user may run, under its own name |
| Input schema | NetSuite's, forwarded verbatim — enums, formats and nested shapes intact |
| `readOnlyHint` / `destructiveHint` | Derived from the tool name, because NetSuite does not declare whether a tool mutates. Conservative: an unrecognised name is announced as a write |
| Effect of the hints | Advisory. A client uses them to decide whether to confirm. Nothing is hidden on that basis — enabling a tool happens in the app |

### Skill bundles

A skill can be one document or a folder:

```
ic-je-review/
  SKILL.md              ← the entry point, always present
  references/
    intake.md
    troubleshooting.md
```

| Limit | Value |
| --- | --- |
| Reference files per skill | 32 |
| Characters per reference file | 64,000 |
| Characters per skill, SKILL.md included | 256,000 |

A person imports a folder as a `.zip` in **Skills**, and downloads one the same
way — a skill with no references downloads as a single `SKILL.md`. Oracle,
Community and Connected packs keep the folder the repo laid out.

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

On org installs, an owner or admin controls this for everyone:

| Setting | Default | Effect |
| --- | --- | --- |
| `enabled` | `false` | Members may mint keys, approve sign-ins, and agents may connect |
| `maxKeysPerUser` | `5` | Active agents one member may hold, counting keys and sign-ins together |

An org with Agent apps disabled refuses a sign-in **on the consent screen
with the reason**, rather than redirecting an opaque `access_denied` the
connector would report as "connection failed".

Agent creation and revocation, OAuth client creation, and every policy change
are written to `AuditLog`. The per-account NetSuite **tool policy** applies
unchanged and is re-checked on every call.

---

## Operating notes

| Note | Detail |
| --- | --- |
| **A dead NetSuite authorization needs a human** | Access tokens refresh five minutes before expiry, but a rejected *refresh* token deletes the stored authorization and the account must be reconnected in the UI. Retrying will not fix it. Give agents `osmcp_connection_status` — it reports this case with a `remediation` string |
| **Revoked rows are kept** | The audit trail and last-used time survive. Revoking an app revokes its tokens, and the next call gets a fresh `401` challenge, which a well-behaved client turns into a sign-in prompt |
| **An access token cannot be read back** | A bearer token can; an access token is stored only as a hash. If a signed-in app stops working, sign it in again |
| **Treat tool output as untrusted** | Results contain NetSuite record data, which is user-controlled text. An agent should not follow instructions found inside a tool result |

---

## What the endpoint returns

Setting a connector up is in
[Connect an agent → Troubleshooting](connect-an-agent.md#troubleshooting).
These are the protocol's own answers.

| Response | Means |
| --- | --- |
| `401` + `WWW-Authenticate` | Credential missing, malformed, revoked or expired. A client supporting OAuth follows the challenge |
| `403 access_denied` | Org policy has Agent apps off, or limits them to members this account is not among |
| `400`, JSON-RPC `-32020` | Required headers missing or disagreeing with the body |
| `405` | `GET` or `DELETE`. The GET stream was removed in `2026-07-28` |
| `200`, only `osmcp_*` tools | NetSuite is not connected. Call `osmcp_connection_status` |
| `200`, a NetSuite tool absent | Tool policy disabled it for that account |
| `invalid_grant` | Code or refresh token already used, expired, or issued to another client. Start a new sign-in |
| `invalid_client` | Unknown `client_id`, or a confidential client sent the wrong secret |

---

## Reference

- [Connect an agent](connect-an-agent.md) — the step-by-step, per client
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [RFC 9728 — Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 — Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 7591 — Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [RFC 8252 — OAuth for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
