import {
  authenticateMcpRequest,
  mcpAuthChallengeHeader,
  recordMcpKeyUse,
} from "@/lib/mcp/server/authenticate";
import { MCP_PROTECTED_RESOURCE_PATH } from "@/lib/mcp/server/config";
import { dispatchMcpRequest } from "@/lib/mcp/server/dispatch";
import {
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_PARSE_ERROR,
  type JsonRpcResponse,
  jsonRpcError,
  parseJsonRpcRequest,
  validateMcpHeaders,
} from "@/lib/mcp/server/protocol";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * OpenSuiteMCP's outbound MCP endpoint.
 *
 * Revision 2026-07-28 of the Streamable HTTP transport is stateless: one POST
 * per JSON-RPC message, no sessions, and no GET stream. Earlier revisions are
 * still served so clients that predate that change can connect.
 *
 * @see https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin, request)) {
    // Required by the transport spec to prevent DNS rebinding.
    return new Response(null, { status: 403 });
  }

  let auth: Awaited<ReturnType<typeof authenticateMcpRequest>>;
  try {
    auth = await authenticateMcpRequest(request);
  } catch (error) {
    // A datastore outage must not surface as a bodiless 500: an agent cannot
    // tell that apart from a rejected key, and would retry with a new one.
    console.error(
      "[MCP Server] Authentication failed:",
      error instanceof Error ? error.message : String(error),
    );
    return Response.json(
      {
        error: "temporarily_unavailable",
        error_description:
          "OpenSuiteMCP could not verify the credential right now. Retry shortly.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!auth.ok) {
    return denied(auth.denial, request);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpc(jsonRpcError(null, JSON_RPC_PARSE_ERROR, "Invalid JSON"), 400);
  }

  const parsed = parseJsonRpcRequest(body);
  if (!parsed) {
    return rpc(
      jsonRpcError(null, JSON_RPC_INVALID_REQUEST, "Invalid JSON-RPC request"),
      400,
    );
  }

  const headerCheck = validateMcpHeaders(request.headers, parsed);
  if (!headerCheck.ok) {
    return rpc(
      jsonRpcError(
        parsed.id ?? null,
        headerCheck.code,
        headerCheck.message,
        headerCheck.data,
      ),
      400,
    );
  }

  recordMcpKeyUse(auth.principal);

  const outcome = await dispatchMcpRequest({
    request: parsed,
    principal: auth.principal,
    protocolVersion: headerCheck.protocolVersion,
  });

  if (!outcome.response) {
    return new Response(null, { status: outcome.status });
  }
  return rpc(outcome.response, outcome.status);
}

/**
 * The GET stream and DELETE session teardown were removed in 2026-07-28. The
 * spec requires 405 so a client from an earlier revision fails fast instead of
 * hanging on a stream that will never open.
 */
export function GET() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}

/**
 * The status is what the spec cares about; the body is for whoever is holding
 * the terminal. An agent handed only a URL and a key probes this endpoint
 * before it reads anything, so the reply says where the surface is described.
 */
function methodNotAllowed() {
  return Response.json(
    {
      error: "method_not_allowed",
      description:
        "This MCP endpoint accepts POST with a JSON-RPC body. Start with tools/list.",
      documentation: MCP_PROTECTED_RESOURCE_PATH,
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function rpc(response: JsonRpcResponse, status: number) {
  return Response.json(response, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function denied(
  denial: { status: number; error: string; description: string },
  request: Request,
) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (denial.status === 401) {
    headers["WWW-Authenticate"] = mcpAuthChallengeHeader(request);
  }
  return Response.json(
    { error: denial.error, error_description: denial.description },
    { status: denial.status, headers },
  );
}

/**
 * Same-origin browser requests are the only ones that carry an Origin header
 * here; server-to-server agents send none. Anything else is refused.
 */
function isAllowedOrigin(origin: string, request: Request): boolean {
  try {
    const requestHost =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}
