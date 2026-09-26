/**
 * How each popular AI client is pointed at an OpenSuiteMCP install.
 *
 * They all speak the same protocol and every one of them asks for it
 * differently: a URL in a dialog, a CLI flag, `mcpServers`, `servers`, `url`,
 * `httpUrl`. The differences are not interesting but they are load-bearing —
 * Gemini CLI's `url` means SSE, so an MCP server pasted there simply never
 * connects — so they are written down once, here, rather than rediscovered.
 *
 * Both ways start in the same place: the agent is created in the portal, named
 * and given a persona, and only then is a client pointed at it. What differs is
 * the last step — approving a sign-in, or pasting a key into a header.
 *
 * The shared first step lives in PREREQUISITE below rather than at the top of
 * every client, so there is one copy of it to keep true.
 */

/** Step one, whichever client and whichever method. */
export const PREREQUISITE: Record<"signIn" | "agentKey", string> = {
  signIn:
    "In App Portal → Agent access, create an agent and choose Sign-in. It waits there until you finish below.",
  agentKey:
    "In App Portal → Agent access, create an agent and choose Agent key. The key is copied to your clipboard once.",
};

/**
 * Everything around the per-client snippets that all three renderings need.
 *
 * The in-app guide, the public docs page and docs/connect-an-agent.md are three
 * views of this file. Writing the same table into all three is how a JSON key
 * goes stale in two of them, so none of them holds its own copy of anything.
 */

/**
 * The bare HTTP calls, for the reference page and for anything hand-rolled.
 *
 * Written once because they had drifted into four spellings — two of them
 * quietly omitting the headers `2026-07-28` requires.
 */
export function buildRawCalls(serverUrl: string): {
  discover: string;
  listTools: string;
  callTool: string;
} {
  const origin = new URL(serverUrl).origin;
  const auth = `  -H "Authorization: Bearer ${KEY_PLACEHOLDER}" \\\n`;
  const common =
    `${auth}` +
    '  -H "Content-Type: application/json" \\\n' +
    '  -H "MCP-Protocol-Version: 2026-07-28" \\\n';
  return {
    discover: `curl -sS ${origin}/.well-known/oauth-protected-resource`,
    listTools:
      `curl -sS ${serverUrl} \\\n${common}` +
      '  -H "Mcp-Method: tools/list" \\\n' +
      `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    callTool:
      `curl -sS ${serverUrl} \\\n${common}` +
      '  -H "Mcp-Method: tools/call" \\\n' +
      '  -H "Mcp-Name: osmcp_whoami" \\\n' +
      `  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"osmcp_whoami","arguments":{}}}'`,
  };
}

export const AGENT_FIELDS: { field: string; does: string }[] = [
  { field: "Name", does: "What you will see in the agent list" },
  { field: "Persona", does: "The NetSuite specialist it acts as" },
  {
    field: "NetSuite account",
    does: "Pins it to one account, or follows your active one",
  },
  { field: "Connects by", does: "Agent key or Sign-in — see below" },
];

export type ComparisonRow = {
  label: string;
  signIn: string;
  agentKey: string;
};

export const METHOD_COMPARISON: ComparisonRow[] = [
  {
    label: "What you paste into the AI",
    signIn: "The server URL",
    agentKey: "The server URL and a key",
  },
  { label: "Needs HTTPS", signIn: "Yes", agentKey: "No" },
  { label: "Needs you present", signIn: "Once, to approve", agentKey: "No" },
  {
    label: "Credential lifetime",
    signIn: "The client refreshes it",
    agentKey: "Until you replace it",
  },
  {
    label: "After creating it",
    signIn: "Marked Awaiting connection until a client signs in",
    agentKey: "Active immediately; the key is shown once",
  },
];

export const METHOD_GUIDANCE = {
  signIn: "A person is setting this up, and the install is on HTTPS.",
  agentKey: "A scheduled job, CI, a client with no OAuth support, or no HTTPS.",
} as const;

export type ReachabilityRow = {
  clients: string;
  runsOn: string;
  lanOnly: string;
};

/** Shown against a vendor-hosted client, where it decides whether any of this works. */
export const VENDOR_REACHABILITY_NOTE =
  "Runs on its vendor's servers, so this install must be reachable from the internet.";

export const REACHABILITY: ReachabilityRow[] = [
  {
    clients: "Claude Code, Cursor, VS Code, Gemini CLI",
    runsOn: "Your machine",
    lanOnly: "Yes",
  },
  {
    clients: "Claude web/desktop/mobile, ChatGPT",
    runsOn: "Vendor servers",
    lanOnly: "No — publish it, or use a key",
  },
];

/** Claude's egress range, for a self-hoster who would rather allowlist. */
export const CLAUDE_EGRESS_RANGE = "160.79.104.0/21";

export type TroubleshootingRow = {
  symptom: string;
  cause: string;
  fix: string;
};

export const CONNECT_TROUBLESHOOTING: TroubleshootingRow[] = [
  {
    symptom: '"Nothing is waiting to connect"',
    cause: "No agent is set to Sign-in",
    fix: "Create one, then retry from the AI",
  },
  {
    symptom: "Sign-in unavailable in the app",
    cause: "The install is not on HTTPS, or AUTH_URL is unset",
    fix: "Set AUTH_URL to the public URL. Use an agent key meanwhile",
  },
  {
    symptom: "The client loops back to sign-in",
    cause: "AUTH_URL disagrees with the URL the client used",
    fix: "Make them match exactly, including scheme and port",
  },
  {
    symptom: "401 on every call",
    cause: "The credential was revoked, or Agent access is off",
    fix: "Check Agent access → Agents, or ask an administrator",
  },
  {
    symptom: "Connects but lists no tools (Gemini CLI)",
    cause: "url was used instead of httpUrl",
    fix: "Change the key to httpUrl",
  },
  {
    symptom: "invalid_grant on refresh",
    cause: "The token was already used, or the agent was revoked",
    fix: "Sign in again",
  },
  {
    symptom: "400 with -32020",
    cause: "Headers disagree with the body on 2026-07-28",
    fix: "Send MCP-Protocol-Version, Mcp-Method and Mcp-Name consistently",
  },
];

export const SELF_HOST_REQUIREMENTS = [
  "AUTH_URL is set to the address people actually use. Unset, it is guessed from forwarded headers — often correctly, which is worse.",
  "The install is served over HTTPS. OAuth 2.1 permits plain HTTP only on loopback; agent keys have no such requirement.",
];

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
  /** Short label for a picker. */
  label: string;
  /** Heading for a documentation page, where there is room to be explicit. */
  docHeading: string;
  /** Where the client runs, which decides whether it can reach a LAN install. */
  runsOn: "vendor" | "device";
  signIn: ConnectMethod | null;
  agentKey: ConnectMethod;
};

/** One spelling of each placeholder, so the three renderings cannot disagree. */
export const KEY_PLACEHOLDER = "osmcp_…";
export const SERVER_URL_PLACEHOLDER =
  "https://your-install.example.com/api/mcp";

export function buildConnectClients(serverUrl: string): ConnectClient[] {
  return [
    {
      id: "claude",
      label: "Claude web, desktop & mobile",
      docHeading: "Claude — web, desktop and mobile",
      runsOn: "vendor",
      signIn: {
        heading: "Add it as a custom connector",
        steps: [
          "In Claude, open Settings → Connectors → Add custom connector.",
          "Paste the server URL below and add the connector.",
          "Claude opens this install. Approve the agent you just created.",
        ],
        snippet: {
          language: "text",
          location: "Remote MCP server URL",
          code: serverUrl,
        },
        note: "Leave Advanced settings blank unless the dialog demands a client ID and secret — then make one under OAuth clients. On Team or Enterprise, only an Owner can add a connector.",
      },
      agentKey: {
        heading: "Use an agent key instead",
        steps: ["Add the key as a request header on the connector."],
        snippet: {
          language: "text",
          location: "Request header",
          code: `Authorization: Bearer ${KEY_PLACEHOLDER}`,
        },
        note: "Request-header auth is in beta and limited to some organizations. Where it is unavailable, sign-in is the only route.",
      },
    },
    {
      id: "claude-code",
      label: "Claude Code",
      docHeading: "Claude Code",
      runsOn: "device",
      signIn: {
        heading: "Add the server, then sign in",
        steps: [
          "Run the command below.",
          "Run /mcp, choose opensuitemcp, and authenticate.",
          "Approve the agent in the browser window that opens.",
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
      docHeading: "Cursor",
      runsOn: "device",
      signIn: {
        heading: "Add it to mcp.json",
        steps: [
          "Put this in .cursor/mcp.json for one project, or ~/.cursor/mcp.json for all of them.",
          "Cursor opens the sign-in. Approve the agent you just created.",
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
      docHeading: "VS Code (GitHub Copilot)",
      runsOn: "device",
      signIn: {
        heading: "Add it to .vscode/mcp.json",
        steps: [
          "Put this in .vscode/mcp.json, or run MCP: Open User Configuration for every workspace.",
          "Start the server from the editor, then approve the agent when prompted.",
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
      docHeading: "Gemini CLI",
      runsOn: "device",
      signIn: {
        heading: "Add it to settings.json",
        steps: [
          "Put this in ~/.gemini/settings.json.",
          "Run /mcp auth opensuitemcp, then approve the agent.",
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
      docHeading: "ChatGPT and the OpenAI API",
      runsOn: "vendor",
      signIn: {
        heading: "Add it as a connector",
        steps: [
          "Add a custom connector and paste the server URL below.",
          "Approve the agent when prompted.",
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
      docHeading: "Anything else",
      runsOn: "device",
      signIn: {
        heading: "Point it at the server URL",
        steps: [
          "Give it the server URL. It reads the 401, finds this install's authorization server, and opens the sign-in.",
          "Check what it discovers with the command below.",
        ],
        snippet: {
          language: "bash",
          code: buildRawCalls(serverUrl).discover,
        },
      },
      agentKey: {
        heading: "Use an agent key instead",
        steps: ["Send the key as a bearer token on every request."],
        snippet: {
          language: "bash",
          code: buildRawCalls(serverUrl).listTools,
        },
      },
    },
  ];
}
