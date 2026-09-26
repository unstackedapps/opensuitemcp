/**
 * How each popular AI client is pointed at an OpenSuiteMCP install.
 *
 * They all speak the same protocol and every one of them asks for it
 * differently: a URL in a dialog, a CLI flag, `mcpServers`, `servers`, `url`,
 * `httpUrl`. The differences are not interesting but they are load-bearing —
 * Gemini CLI's `url` means SSE, so an MCP server pasted there simply never
 * connects — so they are written down once, here, rather than rediscovered.
 *
 * Two ways to connect, and neither is the fallback:
 *
 *   - **Sign in** — the client discovers the authorization server, the person
 *     approves once, and the client refreshes its own token from then on.
 *   - **Agent key** — a credential pasted into a header. The only option for a
 *     client with no OAuth support, an install without HTTPS, or an agent with
 *     no person behind it at all.
 */

export type ConnectClientId =
  | "claude"
  | "claude-code"
  | "cursor"
  | "vscode"
  | "gemini-cli"
  | "chatgpt"
  | "other";

export type ConnectSnippet = {
  language: "bash" | "json" | "text";
  /** Where this goes — a file path, or a field in some dialog. */
  location?: string;
  code: string;
};

export type ConnectMethod = {
  heading: string;
  steps: string[];
  snippet?: ConnectSnippet;
  /** Shown as a caution rather than a step. */
  note?: string;
};

export type ConnectClient = {
  id: ConnectClientId;
  label: string;
  /** Where the client runs, which decides whether it can reach a LAN install. */
  runsOn: "vendor" | "device";
  signIn: ConnectMethod | null;
  agentKey: ConnectMethod;
};

const KEY_PLACEHOLDER = "osmcp_…";

export function buildConnectClients(serverUrl: string): ConnectClient[] {
  return [
    {
      id: "claude",
      label: "Claude web, desktop & mobile",
      runsOn: "vendor",
      signIn: {
        heading: "Add it as a custom connector",
        steps: [
          "Open Settings → Connectors → Add custom connector.",
          "Paste the server URL below and add the connector.",
          "Claude opens this install; approve the agent and you are connected.",
        ],
        snippet: {
          language: "text",
          location: "Remote MCP server URL",
          code: serverUrl,
        },
        note: "On a Team or Enterprise plan only an Owner can add a custom connector. If the dialog asks for an OAuth client ID and secret under Advanced settings, create one under the OAuth clients tab first — otherwise leave those blank.",
      },
      agentKey: {
        heading: "Use an agent key instead",
        steps: [
          "Claude's hosted apps run on Anthropic's servers, so they can only reach an install that is published on the internet.",
          "Request header authentication is in beta and limited to some organizations. Where it is unavailable, sign-in is the only route.",
        ],
        snippet: {
          language: "text",
          location: "Request header",
          code: `Authorization: Bearer ${KEY_PLACEHOLDER}`,
        },
      },
    },
    {
      id: "claude-code",
      label: "Claude Code",
      runsOn: "device",
      signIn: {
        heading: "Add the server, then sign in",
        steps: [
          "Run the command below.",
          "Run /mcp, choose opensuitemcp, and authenticate. A browser opens on this install.",
        ],
        snippet: {
          language: "bash",
          code: `claude mcp add --transport http opensuitemcp ${serverUrl}`,
        },
      },
      agentKey: {
        heading: "Use an agent key instead",
        steps: ["Pass the key as a header when adding the server."],
        snippet: {
          language: "bash",
          code: `claude mcp add --transport http opensuitemcp ${serverUrl} \\\n  --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`,
        },
      },
    },
    {
      id: "cursor",
      label: "Cursor",
      runsOn: "device",
      signIn: {
        heading: "Add it to mcp.json",
        steps: [
          "Put this in .cursor/mcp.json for one project, or ~/.cursor/mcp.json for all of them.",
          "Cursor registers itself with this install and opens the sign-in.",
        ],
        snippet: {
          language: "json",
          location: ".cursor/mcp.json",
          code: JSON.stringify(
            { mcpServers: { opensuitemcp: { url: serverUrl } } },
            null,
            2,
          ),
        },
      },
      agentKey: {
        heading: "Use an agent key instead",
        steps: ["Add the key as a header."],
        snippet: {
          language: "json",
          location: ".cursor/mcp.json",
          code: JSON.stringify(
            {
              mcpServers: {
                opensuitemcp: {
                  url: serverUrl,
                  headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` },
                },
              },
            },
            null,
            2,
          ),
        },
      },
    },
    {
      id: "vscode",
      label: "VS Code (GitHub Copilot)",
      runsOn: "device",
      signIn: {
        heading: "Add it to .vscode/mcp.json",
        steps: [
          "Put this in .vscode/mcp.json, or run MCP: Open User Configuration for every workspace.",
          "Start the server from the editor and complete the sign-in when prompted.",
        ],
        snippet: {
          language: "json",
          location: ".vscode/mcp.json",
          code: JSON.stringify(
            { servers: { opensuitemcp: { type: "http", url: serverUrl } } },
            null,
            2,
          ),
        },
        note: 'VS Code\'s workspace file uses "servers"; the portable .mcp.json format uses "mcpServers" instead.',
      },
      agentKey: {
        heading: "Use an agent key instead",
        steps: ["Add the key as a header."],
        snippet: {
          language: "json",
          location: ".vscode/mcp.json",
          code: JSON.stringify(
            {
              servers: {
                opensuitemcp: {
                  type: "http",
                  url: serverUrl,
                  headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` },
                },
              },
            },
            null,
            2,
          ),
        },
      },
    },
    {
      id: "gemini-cli",
      label: "Gemini CLI",
      runsOn: "device",
      signIn: {
        heading: "Add it to settings.json",
        steps: [
          "Put this in ~/.gemini/settings.json.",
          "Run /mcp auth opensuitemcp to sign in.",
        ],
        snippet: {
          language: "json",
          location: "~/.gemini/settings.json",
          code: JSON.stringify(
            {
              mcpServers: {
                opensuitemcp: {
                  httpUrl: serverUrl,
                  authProviderType: "dynamic_discovery",
                },
              },
            },
            null,
            2,
          ),
        },
        note: 'Use "httpUrl", not "url". In Gemini CLI "url" means an SSE endpoint, and this server does not serve one.',
      },
      agentKey: {
        heading: "Use an agent key instead",
        steps: ["Add the key as a header."],
        snippet: {
          language: "json",
          location: "~/.gemini/settings.json",
          code: JSON.stringify(
            {
              mcpServers: {
                opensuitemcp: {
                  httpUrl: serverUrl,
                  headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` },
                },
              },
            },
            null,
            2,
          ),
        },
      },
    },
    {
      id: "chatgpt",
      label: "ChatGPT & the OpenAI API",
      runsOn: "vendor",
      signIn: {
        heading: "Add it as a connector",
        steps: [
          "Add a custom connector and paste the server URL below.",
          "Complete the sign-in when prompted.",
        ],
        snippet: {
          language: "text",
          location: "MCP server URL",
          code: serverUrl,
        },
      },
      agentKey: {
        heading: "Use an agent key instead",
        steps: [
          "In the Responses API, pass the key on the MCP tool definition.",
        ],
        snippet: {
          language: "json",
          code: JSON.stringify(
            {
              type: "mcp",
              server_label: "opensuitemcp",
              server_url: serverUrl,
              authorization: KEY_PLACEHOLDER,
            },
            null,
            2,
          ),
        },
      },
    },
    {
      id: "other",
      label: "Anything else",
      runsOn: "device",
      signIn: {
        heading: "Point it at the server URL",
        steps: [
          "Any client that implements MCP authorization needs only the URL: it reads the 401, finds this install's authorization server, and signs you in.",
          "Check what it found with the command below.",
        ],
        snippet: {
          language: "bash",
          code: `curl -sS ${new URL(serverUrl).origin}/.well-known/oauth-protected-resource`,
        },
      },
      agentKey: {
        heading: "Use an agent key instead",
        steps: ["Send the key as a bearer token on every request."],
        snippet: {
          language: "bash",
          code: `curl -sS ${serverUrl} \\\n  -H "Authorization: Bearer ${KEY_PLACEHOLDER}" \\\n  -H "Content-Type: application/json" \\\n  -H "MCP-Protocol-Version: 2026-07-28" \\\n  -H "Mcp-Method: tools/list" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
        },
      },
    },
  ];
}
