/**
 * How each popular AI client is pointed at an OpenSuiteMCP install.
 *
 * They all speak the same protocol and every one of them asks for it
 * differently: a URL in a dialog, a JSON file, a key called `mcpServers`. The
 * differences are not interesting but they are load-bearing, so they are
 * written down once, here, rather than rediscovered.
 *
 * Only clients that have connected end to end against a real install belong in
 * this file. See ConnectClientId.
 *
 * Both ways start in the same place: the agent is created in the portal, named
 * and given a persona, and only then is a client pointed at it. What differs is
 * the last step — approving a sign-in, or pasting a key into a header.
 *
 * The shared first step lives in PREREQUISITE below rather than at the top of
 * every client, so there is one copy of it to keep true. The app itself no
 * longer renders any of this: somebody reading it there is already standing in
 * the panel that first step describes.
 */

/**
 * Where each client expects to be sent back after approving.
 *
 * A client that registers itself declares this and nothing here is used. One
 * that demands a client ID and secret cannot declare anything, so the callback
 * has to be registered on this end — and an agent app issued with no callback
 * at all is refused at the first authorization with "that callback address is
 * not registered", which is accurate and unhelpful.
 */
export const KNOWN_CALLBACK_URLS: { label: string; url: string }[] = [
  { label: "Claude", url: "https://claude.ai/api/mcp/auth_callback" },
  {
    label: "ChatGPT",
    url: "https://chatgpt.com/connector_platform_oauth_redirect",
  },
];

/** Step one, whichever client and whichever method. */
export const PREREQUISITE: Record<"signIn" | "agentKey", string> = {
  signIn:
    "App Portal → Agent apps → New app. Choose OAuth 2.1 and save. It waits there until you finish below.",
  agentKey:
    "App Portal → Agent apps → New app. Choose Bearer auth and save. The token is shown once — copy it.",
};

/**
 * Everything around the per-client snippets that all three renderings need.
 *
 * The public docs page and docs/connect-an-agent.md are both views of this
 * file. Writing the same table into both is how a JSON key goes stale in one
 * of them, so neither holds its own copy of anything.
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

export type ComparisonRow = {
  label: string;
  signIn: string;
  agentKey: string;
};

/** The two names, used verbatim everywhere a person reads them. */
export const METHOD_NAMES = {
  signIn: "OAuth 2.1",
  agentKey: "Bearer auth",
} as const;

export const METHOD_GUIDANCE = {
  signIn: "A person is setting this up, and the install is on HTTPS.",
  agentKey: "A scheduled job, CI, a client with no OAuth support, or no HTTPS.",
} as const;

export type ReachabilityRow = {
  clients: string;
  runsOn: string;
  lanOnly: string;
};

export const REACHABILITY: ReachabilityRow[] = [
  { clients: "Cursor", runsOn: "Your machine", lanOnly: "Yes" },
  {
    clients: "Claude web/desktop/mobile, Gemini, ChatGPT",
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
    cause: "No app is set to OAuth 2.1",
    fix: "Create one, then retry from the AI",
  },
  {
    symptom: "OAuth 2.1 unavailable in the app",
    cause: "The install is not on HTTPS, or AUTH_URL is unset",
    fix: "Set AUTH_URL to the public URL. Use a bearer token meanwhile",
  },
  {
    symptom: "The client loops back to sign-in",
    cause: "AUTH_URL disagrees with the URL the client used",
    fix: "Make them match exactly, including scheme and port",
  },
  {
    symptom: "401 on every call",
    cause: "The credential was revoked, or Agent apps are off",
    fix: "Check Agent apps → Agents, or ask an administrator",
  },
  {
    symptom: "invalid_grant on refresh",
    cause: "The token was already used, or the app was revoked",
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
  "The install is served over HTTPS. OAuth 2.1 permits plain HTTP only on loopback; bearer tokens have no such requirement.",
];

/**
 * Only clients we have connected end to end against a real install.
 *
 * Claude Code, VS Code and Gemini CLI were documented from their own docs and
 * never tested here; every vendor we did test needed a server fix first, so
 * the untested ones were removed rather than guessed at. Add one back only
 * after it has actually connected.
 */
export type ConnectClientId =
  | "claude"
  | "cursor"
  | "gemini"
  | "chatgpt"
  | "other";

export type ConnectSnippet = {
  language: "bash" | "json" | "text";
  /** Where this goes — a file path, or a field in some dialog. */
  location?: string;
  code: string;
};

/** The name of this install, as a step group's heading says it. */
export const THIS_APP = "OpenSuiteMCP";

/**
 * A run of steps taken in one application.
 *
 * Connecting always crosses between two: the app is created here, configured
 * in the client, and approved back here. Grouping makes each hop a heading
 * rather than a prefix repeated on every line.
 */
export type ConnectStepGroup = { app: string; steps: string[] };

export type ConnectMethod = {
  heading: string;
  /**
   * Groups after the opening one, which is always creating the app here and
   * comes from PREREQUISITE.
   */
  groups: ConnectStepGroup[];
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
  /** Null where the client has no way to send a header, as Gemini does not. */
  agentKey: ConnectMethod | null;
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
        groups: [
          {
            app: "Claude",
            steps: [
              "Customize → Connectors → Add → Add custom connector.",
              "Enter a name and the server URL below, then press Continue.",
              "Choose CIMD, DCR, or your own OAuth client. The third asks for a client ID and secret.",
              "Press Add, then Connect.",
            ],
          },
          { app: THIS_APP, steps: ["Approve the app on the consent screen."] },
        ],
        snippet: {
          language: "text",
          location: "MCP server URL",
          code: serverUrl,
        },
        note: "On Team or Enterprise, only an Owner can add a connector.",
      },
      // The connector dialog offers three OAuth registration methods and no
      // header field. Claude's request-header auth is an org-gated beta that
      // has not been tried here, so it is not documented.
      agentKey: null,
    },
    {
      id: "cursor",
      label: "Cursor",
      docHeading: "Cursor",
      runsOn: "device",
      signIn: {
        heading: "Add it to mcp.json",
        groups: [
          {
            app: "Cursor",
            steps: [
              "Settings → Customize → MCPs → New MCP Server. Cursor opens mcp.json.",
              "Add the object below and save.",
            ],
          },
          {
            app: THIS_APP,
            steps: ["Approve the app on the consent screen Cursor opens."],
          },
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
        heading: "Use a bearer token instead",
        groups: [
          {
            app: "Cursor",
            steps: ["Add the key as a header in the same file."],
          },
        ],
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
      id: "gemini",
      label: "Gemini web app",
      docHeading: "Gemini web app",
      runsOn: "vendor",
      signIn: {
        heading: "Add it as a custom app",
        groups: [
          {
            app: "Gemini",
            steps: [
              "Settings → Personal intelligence → Connected apps → Custom apps.",
              "Paste the server URL below and press Next.",
              "Press Next again to register automatically, or open Additional settings to paste a client ID and secret.",
              "Accept Google's privacy notice.",
            ],
          },
          { app: THIS_APP, steps: ["Approve the app on the consent screen."] },
          { app: "Gemini", steps: ["Press Connect."] },
        ],
        snippet: {
          language: "text",
          location: "Server URL",
          code: serverUrl,
        },
        note: "Personal Google accounts only; custom apps are not available on Workspace accounts yet. Additional settings shows the redirect URI to register if you are using your own client ID and secret.",
      },
      agentKey: null,
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      docHeading: "ChatGPT",
      runsOn: "vendor",
      signIn: {
        heading: "Create an MCP app",
        groups: [
          {
            app: "ChatGPT",
            steps: [
              "Settings → Plugins → Browse plugins → Create app → Create MCP app.",
              "Give it a Name, and paste the server URL below under Connection → Server URL.",
              "Leave Authentication on OAuth.",
              "Tick I understand and want to continue, then press Create.",
            ],
          },
          {
            app: THIS_APP,
            steps: [
              "Approve the app on the consent screen. You land back on the plugins page.",
            ],
          },
        ],
        snippet: {
          language: "text",
          location: "Connection → Server URL",
          code: serverUrl,
        },
        note: "Advanced OAuth settings shows what ChatGPT discovered and lets you swap CIMD for DCR or your own client ID and secret. The discovered values work as they are.",
      },
      // Verified through the connector only. Whether a ChatGPT connector or
      // the Responses API will carry a bearer header has not been tried here,
      // so nothing is claimed.
      agentKey: null,
    },
    {
      id: "other",
      label: "Anything else",
      docHeading: "Anything else",
      runsOn: "device",
      signIn: {
        heading: "Point it at the server URL",
        groups: [
          {
            app: "the client",
            steps: [
              "Give it the server URL. It reads the 401, finds this install's authorization server, and opens the sign-in.",
            ],
          },
          { app: THIS_APP, steps: ["Approve the app on the consent screen."] },
        ],
        snippet: {
          language: "bash",
          code: buildRawCalls(serverUrl).discover,
        },
      },
      agentKey: {
        heading: "Use a bearer token instead",
        groups: [
          {
            app: "the client",
            steps: ["Send the key as a bearer token on every request."],
          },
        ],
        snippet: {
          language: "bash",
          code: buildRawCalls(serverUrl).listTools,
        },
      },
    },
  ];
}
