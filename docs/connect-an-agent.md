# Connect an agent

Point Claude, Cursor, VS Code, Gemini CLI, ChatGPT or anything else that speaks
MCP at your NetSuite workspace.

Two steps: **create the agent in the app**, then **point the AI at it**.

---

## 1. Create the agent

Open **App Portal → Agent access** and copy the **Server URL** at the top. You
will paste it in step 2.

Then click **New agent** and fill in:

| Field | What it does |
| --- | --- |
| Name | What you will see in the agent list |
| Persona | The NetSuite specialist it acts as |
| NetSuite account | Pins it to one account, or follows your active one |
| Connects by | **Agent key** or **Sign-in** — see below |

### Which connection method

| | **Sign-in** | **Agent key** |
| --- | --- | --- |
| What you paste into the AI | The server URL | The server URL and a key |
| Needs HTTPS | Yes | No |
| Needs you present | Once, to approve | No |
| Credential lifetime | The client refreshes it | Until you replace it |

Pick **Sign-in** if a person is setting this up and the install is on HTTPS.
Pick **Agent key** for a scheduled job, CI, a client with no OAuth support, or
an install that is not on HTTPS.

**Sign-in** leaves the agent marked *Awaiting connection* until you finish
step 2. **Agent key** copies the key to your clipboard once.

---

## 2. Point the AI at it

Replace `https://your-install.example.com/api/mcp` with your Server URL, and
`osmcp_…` with your key.

### Claude — web, desktop and mobile

1. **Settings → Connectors → Add custom connector**
2. Paste the server URL
3. Approve the agent when Claude opens this install

```text
https://your-install.example.com/api/mcp
```

On a Team or Enterprise plan only an Owner can add a custom connector. Leave
*Advanced settings* blank unless the dialog demands a client ID and secret — in
that case make one under **Agent access → OAuth clients** first.

### Claude Code

```bash
claude mcp add --transport http opensuitemcp https://your-install.example.com/api/mcp
```

Then run `/mcp`, choose `opensuitemcp`, authenticate, and approve the agent.

With a key instead:

```bash
claude mcp add --transport http opensuitemcp https://your-install.example.com/api/mcp \
  --header "Authorization: Bearer osmcp_…"
```

### Cursor

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

With a key, add `"headers": { "Authorization": "Bearer osmcp_…" }`.

### VS Code (GitHub Copilot)

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

⚠️ VS Code's workspace file uses `servers`. The portable `.mcp.json` format uses
`mcpServers`.

### Gemini CLI

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

⚠️ Use `httpUrl`, not `url`. In Gemini CLI `url` means SSE, which this server
does not serve — so the connection silently never works.

### ChatGPT and the OpenAI API

Add a custom connector and paste the server URL. In the Responses API:

```json
{
  "type": "mcp",
  "server_label": "opensuitemcp",
  "server_url": "https://your-install.example.com/api/mcp",
  "authorization": "osmcp_…"
}
```

### Anything else

Any client implementing MCP authorization needs only the URL. Check what it will
discover:

```bash
curl -sS https://your-install.example.com/.well-known/oauth-protected-resource
```

Or send a key directly:

```bash
curl -sS https://your-install.example.com/api/mcp \
  -H "Authorization: Bearer osmcp_…" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/list" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## Can the AI reach your install?

| Client | Runs on | Reaches a LAN-only install |
| --- | --- | --- |
| Claude Code, Cursor, VS Code, Gemini CLI | Your machine | Yes |
| Claude web/desktop/mobile, ChatGPT | Vendor servers | No — publish it, or use a key over a tunnel |

Claude's egress range is `160.79.104.0/21` if you would rather allowlist than
publish.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| *"Nothing is waiting to connect"* | No agent set to **Sign-in** | Create one, then retry from the AI |
| Sign-in option greyed out in the app | Install is not on HTTPS, or `AUTH_URL` is unset | Set `AUTH_URL` to the public URL; use an agent key meanwhile |
| Client loops back to sign-in | `AUTH_URL` disagrees with the URL the client used | Make them match exactly, including scheme and port |
| `401` on every call | Key revoked, or Agent access turned off | Check **Agent access → Agents**; ask an admin |
| Gemini CLI connects but lists no tools | `url` used instead of `httpUrl` | Change the key to `httpUrl` |
| `400` with `-32020` | Headers disagree with the body on `2026-07-28` | Send `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` consistently |

---

## Managing agents

**App Portal → Agent access → Agents** lists every agent, whichever way it
connects. Rename, change persona, replace a key, or revoke. Revoking is
immediate: the next call gets `401`.

Self-hosting details and the protocol reference are in
[MCP server](mcp-server.md).
