# Connect an agent

OpenSuiteMCP is an **MCP server**. Any AI that speaks MCP over HTTP — Claude,
Cursor, VS Code, Gemini CLI, ChatGPT, or something you wrote yourself — can work
in your NetSuite workspace as you, with your permissions and your tool policy.

There are two ways to let one in, and neither is the fallback.

---

## Which one do I use

| | **Sign in** | **Agent key** |
| --- | --- | --- |
| What you hand the AI | The server URL | The server URL and a key |
| Who approves it | You, on a consent screen | You, by creating the key |
| Credential lifetime | The client refreshes its own | Until you replace or revoke it |
| Needs HTTPS | Yes | No |
| Needs a person present | Yes, once | No |

**Sign in** when a person is setting the agent up and the install is on HTTPS.
The client discovers everything it needs from the URL alone.

**Use an agent key** when there is no person in the loop — a scheduled job, CI,
an automation platform — or when the client has no OAuth support, or the install
is not on HTTPS.

A client running on your own machine (Claude Code, Cursor, VS Code, Gemini CLI)
can reach an install that only exists on your network. Claude's hosted apps and
ChatGPT run on their vendor's servers and can only reach an install published on
the internet.

---

## Where everything is

Open the app, then **App Portal → Agent access**.

| Tab | What it is for |
| --- | --- |
| **Agents** | Every agent you have, however it connected. Rename, change persona, revoke |
| **How to connect** | The exact thing to paste, per client |
| **OAuth clients** | Only needed by a connector that asks for a client ID and secret |

The **Server URL** at the top is what every client needs. It is this install's
own address with `/api/mcp` on the end.

---

## Claude — web, desktop and mobile

1. **Settings → Connectors → Add custom connector**.
2. Paste the server URL.
3. Claude opens this install. Approve the agent and you are connected.

On a Team or Enterprise plan only an Owner can add a custom connector.

If the dialog asks for an **OAuth client ID** and **secret** under *Advanced
settings*, leave them blank — this install registers Claude automatically. Fill
them in only if your organization requires a pre-registered client, in which
case create one first under **OAuth clients** and register the callback
`https://claude.ai/api/mcp/auth_callback`.

Claude's hosted apps reach your install from `160.79.104.0/21`, which is what to
allowlist if you would rather not publish it openly.

---

## Claude Code

```bash
claude mcp add --transport http opensuitemcp https://your-install.example.com/api/mcp
```

Then run `/mcp`, choose `opensuitemcp`, and authenticate. A browser opens on
this install; approve the agent and Claude Code is connected.

With a key instead:

```bash
claude mcp add --transport http opensuitemcp https://your-install.example.com/api/mcp \
  --header "Authorization: Bearer osmcp_..."
```

---

## Cursor

`.cursor/mcp.json` for one project, `~/.cursor/mcp.json` for all of them:

```json
{
  "mcpServers": {
    "opensuitemcp": {
      "url": "https://your-install.example.com/api/mcp"
    }
  }
}
```

Cursor registers itself with this install and opens the sign-in.

With a key instead, add a header:

```json
{
  "mcpServers": {
    "opensuitemcp": {
      "url": "https://your-install.example.com/api/mcp",
      "headers": { "Authorization": "Bearer osmcp_..." }
    }
  }
}
```

---

## VS Code (GitHub Copilot)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "opensuitemcp": {
      "type": "http",
      "url": "https://your-install.example.com/api/mcp"
    }
  }
}
```

Start the server from the editor and complete the sign-in when prompted.

VS Code's workspace file uses `servers`. The portable `.mcp.json` format uses
`mcpServers` instead — the same object under a different key.

---

## Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "opensuitemcp": {
      "httpUrl": "https://your-install.example.com/api/mcp",
      "authProviderType": "dynamic_discovery"
    }
  }
}
```

Then `/mcp auth opensuitemcp`.

**Use `httpUrl`, not `url`.** In Gemini CLI `url` means an SSE endpoint, and
this server does not serve one. A server configured under `url` fails to connect
with nothing useful in the output.

---

## ChatGPT and the OpenAI API

Add a custom connector and paste the server URL.

From the Responses API, pass a key on the tool definition:

```json
{
  "type": "mcp",
  "server_label": "opensuitemcp",
  "server_url": "https://your-install.example.com/api/mcp",
  "authorization": "osmcp_..."
}
```

---

## Anything else

A client that implements MCP authorization needs only the URL. It sends an
unauthenticated request, reads the `401`, follows the pointer to this install's
metadata, and signs you in.

Check what it will find:

```bash
curl -sS https://your-install.example.com/.well-known/oauth-protected-resource
```

```json
{
  "resource": "https://your-install.example.com/api/mcp",
  "resource_name": "OpenSuiteMCP",
  "authorization_servers": ["https://your-install.example.com"],
  "scopes_supported": ["mcp"],
  "bearer_methods_supported": ["header"]
}
```

With a key, every request carries it as a bearer token:

```bash
curl -sS https://your-install.example.com/api/mcp \
  -H "Authorization: Bearer osmcp_..." \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/list" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## What you are approving

The consent screen asks for three things, and they are the same three a key
carries:

- **A name** — what the agent is called in your list afterwards.
- **A NetSuite account** — pin it, and changing your active account later cannot
  redirect the agent at another subsidiary. Leave it on *Any* to follow whatever
  is active.
- **A persona** — the specialist the agent is meant to be. Advisory: the agent
  runs its own model, so adopting the persona is its own act. It is reported by
  `osmcp_whoami` so a fresh session learns its role without being told.

What the agent can actually reach is not on that screen, because it is not the
agent's to decide. A NetSuite tool left enabled for the connection is listed and
callable; one disabled there is neither, and the policy is re-read on **every
call**.

If the consent screen warns that the agent **runs on your own computer**, it is
a native client identified only by the port it is listening on. Approve it if
you just started a sign-in yourself, and close the page if you did not.

---

## Managing what you connected

Everything lands in one list under **Agent access → Agents**, whichever way it
connected.

| | Signed in | Agent key |
| --- | --- | --- |
| Rename | ✅ | ✅ |
| Change persona | ✅ | ✅ |
| Copy the credential | — | ✅ |
| Replace the credential | — | ✅ (Replace) |
| Revoke | ✅ | ✅ |

Revoking is immediate and permanent. The row is kept, so the threads the agent
opened still name it. A revoked sign-in stops working on the agent's next call —
a well-behaved client turns that into a fresh sign-in prompt rather than a
silent failure.

Signing the same client in twice creates **two** agents rather than replacing the
first. That is deliberate: one client pinned to two subsidiaries is as common as
a duplicate, and quietly killing a working agent is the worse mistake.

---

## Self-hosting

Sign-in works on every install — self-hosted, sandbox and cloud — with no extra
configuration. Each install is its own authorization server, at its own address.
Nothing points at `opensuitemcp.com` and there is nothing to register anywhere.

Two things have to be true, and **Agent access → How to connect** tells you
whether they are.

**Set `AUTH_URL`.** Every discovery document states its own issuer, and a client
refuses the document unless that value matches the address it asked for. With
`AUTH_URL` unset the address is guessed from forwarded headers — often
correctly, which is worse, because it works until the day it does not.

```bash
AUTH_URL=https://netsuite.acme.com
```

**Serve it over HTTPS.** OAuth 2.1 permits plain HTTP only on loopback. An
install on plain HTTP still works with agent keys, which have no such
requirement.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTH_URL` | guessed from headers | This install's public address |
| `ENCRYPTION_KEY` | required | Encrypts recoverable secrets |
| `OAUTH_ATTEMPT_LIMIT_PER_MINUTE` | `0` (disabled) | Per-client budget on registration and token requests. Needs `REDIS_URL`; fails open without it |

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| The client says it cannot reach the server | The install is not reachable from wherever that client runs. A vendor-hosted client cannot see a LAN-only install |
| Sign-in never starts; the client asks for a token | The client got no `401`, or has no OAuth support. Check `/.well-known/oauth-protected-resource` returns `authorization_servers` |
| Sign-in starts and fails immediately | The issuer does not match. Set `AUTH_URL` to the address people actually use |
| "That agent is not registered with this install" | The `client_id` is unknown here. A client that registered against a different install must register again |
| "That callback address is not registered" | The client asked to be sent somewhere it never registered. Nothing was sent to it |
| `invalid_grant` on refresh | The refresh token was already used or the authorization was revoked. The client should start a new sign-in |
| Agent access is turned off | An owner or admin has to enable it under **Admin → Agent access** |
| `403 access_denied` | Org policy has Agent access disabled, or limits it to members you are not among |
| `401` on every call after it worked | The agent was revoked, or the key was replaced |

---

## Reference

- [MCP server](mcp-server.md) — the tool surface, the protocol, and operating notes
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [RFC 9728 — Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 — Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
