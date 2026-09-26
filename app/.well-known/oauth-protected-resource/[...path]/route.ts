import { getPublicAppOrigin } from "@/lib/http/public-origin";
import {
  getMcpResourceIdentifier,
  getMcpServerUrl,
  MCP_SERVER_PATH,
} from "@/lib/mcp/server/config";
import { buildProtectedResourceMetadata } from "@/lib/mcp/server/oauth/metadata";
import {
  discoveryJson,
  discoveryOptions,
} from "@/lib/mcp/server/oauth/responses";

export const dynamic = "force-dynamic";

/**
 * The path-inserted form of the protected resource metadata.
 *
 * RFC 9728 puts the resource's own path after the well-known suffix, so an MCP
 * endpoint at `/api/mcp` is described at
 * `/.well-known/oauth-protected-resource/api/mcp`. Claude probes this before it
 * falls back to the root document, and a client that never saw the 401 — one
 * configured from a bare URL — may only ever try this one.
 *
 * Only this install's own MCP path is described. Anything else is a 404, rather
 * than a document claiming to describe a resource that does not exist.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (`/${path.join("/")}` !== MCP_SERVER_PATH) {
    return new Response(null, { status: 404 });
  }

  return discoveryJson(
    buildProtectedResourceMetadata({
      origin: getPublicAppOrigin(request),
      resource: getMcpResourceIdentifier(request),
      mcpEndpoint: getMcpServerUrl(request),
    }),
  );
}

export function OPTIONS() {
  return discoveryOptions();
}
