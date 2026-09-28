import "server-only";

import { APP_VERSION } from "@/lib/app-release";
import { allowMcpCallBurst } from "@/lib/rate-limit";
import type { McpPrincipal } from "./authenticate";
import {
  BUILTIN_MCP_PROMPTS,
  builtinPromptMessages,
  NETSUITE_PROMPT_PREFIX,
  netsuitePromptName,
  netsuitePromptToMcp,
} from "./prompt-surface";
import {
  isHandshakeEraVersion,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  type JsonRpcRequest,
  type JsonRpcResponse,
  jsonRpcError,
  jsonRpcResult,
  MCP_LATEST_PROTOCOL_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  type McpProtocolVersion,
  negotiateInitializeVersion,
} from "./protocol";
import { buildMcpServerInfo } from "./server-info";
import { buildToolSurface, findTool, toWireTool } from "./tools";
import { toolSurfaceDigest } from "./tools/digest";
import { fillPrompt, loadNetSuitePromptsOrNone } from "./tools/prompts";
import { type McpToolDefinition, toolError } from "./tools/types";
import { validateToolArgs } from "./tools/validate-args";

/** Discovery results are per-user, so they must never be cached across keys. */
const PRIVATE_CACHE = { ttlMs: 60_000, cacheScope: "private" as const };

/**
 * What a connecting client is told once, at initialize.
 *
 * Kept short on purpose. This arrives as one block in a system prompt and
 * competes with everything else there, so it carries only what a model cannot
 * learn from the tool list: who it is acting as, and the two habits — read the
 * persona, record the work — that nothing in a tool name implies. Everything
 * else belongs in the tool's own description, which is re-read on every
 * tools/list rather than once per connection.
 */
const SERVER_INSTRUCTIONS = [
  "This server is one OpenSuiteMCP user's NetSuite workspace. Every call acts as that user, with their permissions, their connected account, and their tool policy.",
  "Start by calling osmcp_whoami. It reports who you are acting as, which NetSuite account is active, and which persona this connection is assigned.",
  "Work as that persona. Read it with osmcp_get_persona, read the skills it carries with osmcp_get_skill, and follow them.",
  "Record what you do. Open a thread with osmcp_create_chat at the start of any task worth reviewing, and add each step with osmcp_append_chat as you go — the person who owns this workspace reads those threads, and work that leaves no thread leaves no record.",
  "What you learn is worth keeping. osmcp_create_skill saves a procedure you established so the next session starts from it, and osmcp_pair_skills attaches it to the persona that needs it.",
  "Read each tool's own description before first use; they carry the rules that matter. tools/list and osmcp_whoami both return toolsDigest, so compare that string instead of re-reading the list.",
].join(" ");

export type DispatchOutcome = {
  response: JsonRpcResponse | null;
  status: number;
};

const ACCEPTED = { response: null, status: 202 } as const;

/**
 * Route one JSON-RPC message.
 *
 * Handshake-era methods are answered so clients predating revision
 * 2026-07-28 — which is most deployed clients today — can still connect.
 */
export async function dispatchMcpRequest(params: {
  request: JsonRpcRequest;
  principal: McpPrincipal;
  protocolVersion: McpProtocolVersion;
  /**
   * This install's public address, passed in rather than resolved here: the
   * identity a client displays is built from it, and only the route holds the
   * headers it is derived from.
   */
  origin: string;
}): Promise<DispatchOutcome> {
  const { request, principal, protocolVersion, origin } = params;

  // Notifications carry no id and expect no body.
  if (request.id === null || request.id === undefined) {
    return ACCEPTED;
  }
  const id = request.id;

  try {
    switch (request.method) {
      case "server/discover":
        return ok(id, discoverResult(protocolVersion, origin));

      case "initialize":
        if (!isHandshakeEraVersion(protocolVersion)) {
          return notFound(id, request.method);
        }
        return ok(
          id,
          initializeResult(
            negotiateInitializeVersion(request, protocolVersion),
            origin,
          ),
        );

      case "ping":
        return ok(id, {});

      case "tools/list": {
        const tools = await buildToolSurface(principal);
        return ok(id, {
          tools: tools.map(toWireTool),
          resultType: "complete",
          // This server cannot push tools/list_changed (see toolSurfaceDigest).
          // A watching agent compares this instead of every entry.
          toolsDigest: toolSurfaceDigest(tools),
          toolCount: tools.length,
          ...PRIVATE_CACHE,
        });
      }

      case "tools/call":
        return await callTool(id, request, principal);

      case "prompts/list":
        return ok(id, await listPrompts(principal));

      case "prompts/get":
        return await getPrompt(id, request, principal);

      default:
        return await notFoundMaybeTool(id, request.method, principal);
    }
  } catch (error) {
    console.error(
      `[MCP Server] ${request.method} failed:`,
      error instanceof Error ? error.message : String(error),
    );
    return {
      response: jsonRpcError(
        id,
        JSON_RPC_INTERNAL_ERROR,
        "Internal server error",
      ),
      status: 200,
    };
  }
}

async function callTool(
  id: string | number,
  request: JsonRpcRequest,
  principal: McpPrincipal,
): Promise<DispatchOutcome> {
  const params = request.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  if (!name) {
    return {
      response: jsonRpcError(
        id,
        JSON_RPC_INVALID_PARAMS,
        "tools/call requires a string 'name'",
      ),
      status: 200,
    };
  }

  const args =
    params.arguments &&
    typeof params.arguments === "object" &&
    !Array.isArray(params.arguments)
      ? (params.arguments as Record<string, unknown>)
      : {};

  const allowed = await allowMcpCallBurst(principal.keyId);
  if (!allowed) {
    return {
      response: jsonRpcError(
        id,
        JSON_RPC_INTERNAL_ERROR,
        "Rate limit exceeded for this API key. Wait a minute and retry.",
      ),
      status: 200,
    };
  }

  const tool = await findTool(principal, name);
  if (!tool) {
    // A tool the key lacks scope for is reported as unknown rather than
    // forbidden, so the error does not confirm the tool exists.
    return notFound(id, `tools/call ${name}`);
  }

  // A tool publishes a schema so an agent can get the call right; enforcing it
  // is what makes a wrong call say so instead of half-succeeding. Reported as a
  // tool result rather than a JSON-RPC error so the model reads the reason and
  // retries, the way every other tool-level failure here behaves.
  const invalid = validateToolArgs(name, tool.inputSchema, args);
  if (invalid) {
    return ok(id, { ...toolError(invalid), resultType: "complete" });
  }

  // Assembled at most once per call, and only if a tool asks for it.
  let surface: McpToolDefinition[] | null = null;
  const result = await tool.execute(args, principal, {
    toolSurface: async () => {
      surface ??= await buildToolSurface(principal);
      return surface;
    },
  });
  return ok(id, { ...result, resultType: "complete" });
}

function discoverResult(protocolVersion: McpProtocolVersion, origin: string) {
  return {
    supportedVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
    protocolVersion,
    capabilities: MCP_CAPABILITIES,
    serverInfo: buildMcpServerInfo({ origin, version: APP_VERSION }),
    instructions: SERVER_INSTRUCTIONS,
    resultType: "complete",
    ...PRIVATE_CACHE,
  };
}

function initializeResult(protocolVersion: McpProtocolVersion, origin: string) {
  return {
    protocolVersion:
      protocolVersion === MCP_LATEST_PROTOCOL_VERSION
        ? "2025-11-25"
        : protocolVersion,
    capabilities: MCP_CAPABILITIES,
    serverInfo: buildMcpServerInfo({ origin, version: APP_VERSION }),
    instructions: SERVER_INSTRUCTIONS,
  };
}

/**
 * This server is stateless, so nothing can be pushed. Both listChanged flags
 * are false and a client re-reads when it chooses; toolsDigest on tools/list
 * is how a watching agent notices a change without a notification.
 */
const MCP_CAPABILITIES = {
  tools: { listChanged: false },
  prompts: { listChanged: false },
} as const;

/**
 * Prompts a person picks from their client's own menu.
 *
 * The built-ins are the workflows this server knows and a model does not; the
 * rest is whatever the connected NetSuite account publishes in its Companion
 * library, which is the point — a NetSuite prompt becomes something to choose
 * in Claude or Cursor rather than something to go and look up.
 */
async function listPrompts(principal: McpPrincipal) {
  const netsuitePrompts = await loadNetSuitePromptsOrNone(principal);
  const seen = new Set(BUILTIN_MCP_PROMPTS.map((prompt) => prompt.name));
  const published: ReturnType<typeof netsuitePromptToMcp>[] = [];
  for (const prompt of netsuitePrompts) {
    const mapped = netsuitePromptToMcp(prompt);
    // Two library entries can slug to one name; the first wins rather than
    // shadowing, so a name always resolves back to one prompt.
    if (seen.has(mapped.name)) {
      continue;
    }
    seen.add(mapped.name);
    published.push(mapped);
  }

  return {
    prompts: [...BUILTIN_MCP_PROMPTS, ...published],
    resultType: "complete",
    ...PRIVATE_CACHE,
  };
}

async function getPrompt(
  id: string | number,
  request: JsonRpcRequest,
  principal: McpPrincipal,
): Promise<DispatchOutcome> {
  const params = (request.params ?? {}) as {
    name?: unknown;
    arguments?: unknown;
  };
  const name = typeof params.name === "string" ? params.name.trim() : "";
  const args =
    params.arguments && typeof params.arguments === "object"
      ? (params.arguments as Record<string, unknown>)
      : undefined;

  if (!name) {
    return {
      response: jsonRpcError(
        id,
        JSON_RPC_INVALID_PARAMS,
        "Pass a prompt name.",
      ),
      status: 200,
    };
  }

  const builtin = BUILTIN_MCP_PROMPTS.find((prompt) => prompt.name === name);
  if (builtin) {
    return ok(id, {
      description: builtin.description,
      messages: builtinPromptMessages(name, args) ?? [],
    });
  }

  if (name.startsWith(NETSUITE_PROMPT_PREFIX)) {
    const prompts = await loadNetSuitePromptsOrNone(principal);
    const match = prompts.find((prompt) => netsuitePromptName(prompt) === name);
    if (match) {
      // A client may send a number or a boolean for an argument; the filler
      // substitutes text, so anything else is stringified rather than dropped.
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(args ?? {})) {
        if (value !== null && value !== undefined) {
          values[key] = String(value);
        }
      }
      const filled = fillPrompt(match.prompt, values);
      return ok(id, {
        description: netsuitePromptToMcp(match).description,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                filled.unfilled.length > 0
                  ? `${filled.text}\n\nStill to fill: ${filled.unfilled.map((entry) => entry.label).join(", ")}. A value in square brackets is a blank, not text to use as written.`
                  : filled.text,
            },
          },
        ],
      });
    }
  }

  return {
    response: jsonRpcError(
      id,
      JSON_RPC_INVALID_PARAMS,
      `No prompt \`${name}\`. Call prompts/list for the names this server publishes.`,
    ),
    status: 200,
  };
}

function ok(id: string | number, result: unknown): DispatchOutcome {
  return { response: jsonRpcResult(id, result), status: 200 };
}

/**
 * Every method this server answers. Returned with a method-not-found so an
 * agent probing the endpoint learns the surface from the error instead of
 * guessing at names, the way the unsupported-version error already names the
 * versions it accepts.
 */
const SUPPORTED_METHODS = [
  "initialize",
  "ping",
  "tools/list",
  "tools/call",
] as const;

/**
 * A tool name sent as the JSON-RPC method.
 *
 * An agent that reads tools/list and then calls `osmcp_whoami` as a method has
 * made one specific mistake, and the server knows enough to name it: the tool
 * exists, it is simply reached through tools/call. Saying so beats listing the
 * four methods and leaving the agent to infer which one wraps a tool.
 */
async function notFoundMaybeTool(
  id: string | number,
  method: string,
  principal: McpPrincipal,
): Promise<DispatchOutcome> {
  const tool = await findTool(principal, method);
  if (!tool) {
    return notFound(id, method);
  }

  return {
    response: jsonRpcError(
      id,
      JSON_RPC_METHOD_NOT_FOUND,
      `Method not found: ${method}. "${method}" is a tool, not a method — call it with the "tools/call" method and {"name": "${method}"} in params.`,
      { supported: [...SUPPORTED_METHODS], tool: method },
    ),
    status: 404,
  };
}

function notFound(id: string | number, method: string): DispatchOutcome {
  return {
    response: jsonRpcError(
      id,
      JSON_RPC_METHOD_NOT_FOUND,
      `Method not found: ${method}`,
      { supported: [...SUPPORTED_METHODS] },
    ),
    status: 404,
  };
}
