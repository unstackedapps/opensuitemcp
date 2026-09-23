import "server-only";

import { APP_VERSION } from "@/lib/app-release";
import { allowMcpCallBurst } from "@/lib/rate-limit";
import type { McpPrincipal } from "./authenticate";
import { MCP_SERVER_NAME } from "./config";
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
} from "./protocol";
import { buildToolSurface, findTool, toWireTool } from "./tools";

/** Discovery results are per-user, so they must never be cached across keys. */
const PRIVATE_CACHE = { ttlMs: 60_000, cacheScope: "private" as const };

const SERVER_INSTRUCTIONS = [
  "This server exposes one OpenSuiteMCP user's NetSuite workspace. Every call acts as that user, with their permissions and their connected NetSuite account.",
  "Call osmcp_whoami first to confirm the acting identity and the active NetSuite account.",
  "If a NetSuite tool fails, call osmcp_connection_status. A dead authorization needs a person to reconnect the account in the OpenSuiteMCP UI and will not recover on retry.",
  "Tools marked readOnlyHint never change NetSuite data. Tools without it may modify records, so confirm before calling one. The hint is derived from the tool name and is deliberately cautious: an unrecognised name is announced as a write.",
  "Tool results carry both readable text and structuredContent; prefer structuredContent for rows and columns.",
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
}): Promise<DispatchOutcome> {
  const { request, principal, protocolVersion } = params;

  // Notifications carry no id and expect no body.
  if (request.id === null || request.id === undefined) {
    return ACCEPTED;
  }
  const id = request.id;

  try {
    switch (request.method) {
      case "server/discover":
        return ok(id, discoverResult(protocolVersion));

      case "initialize":
        if (!isHandshakeEraVersion(protocolVersion)) {
          return notFound(id, request.method);
        }
        return ok(id, initializeResult(protocolVersion));

      case "ping":
        return ok(id, {});

      case "tools/list": {
        const tools = await buildToolSurface(principal);
        return ok(id, {
          tools: tools.map(toWireTool),
          resultType: "complete",
          ...PRIVATE_CACHE,
        });
      }

      case "tools/call":
        return await callTool(id, request, principal);

      default:
        return notFound(id, request.method);
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

  const result = await tool.execute(args, principal);
  return ok(id, { ...result, resultType: "complete" });
}

function discoverResult(protocolVersion: McpProtocolVersion) {
  return {
    supportedVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: MCP_SERVER_NAME, version: APP_VERSION },
    instructions: SERVER_INSTRUCTIONS,
    resultType: "complete",
    ...PRIVATE_CACHE,
  };
}

function initializeResult(protocolVersion: McpProtocolVersion) {
  return {
    protocolVersion:
      protocolVersion === MCP_LATEST_PROTOCOL_VERSION
        ? "2025-11-25"
        : protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: MCP_SERVER_NAME, version: APP_VERSION },
    instructions: SERVER_INSTRUCTIONS,
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
