import { getPublicAppOrigin } from "@/lib/http/public-origin";
import {
  getMcpResourceIdentifier,
  getMcpServerUrl,
} from "@/lib/mcp/server/config";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 protected resource metadata.
 *
 * A spec-compliant client that receives a 401 from the MCP endpoint reads the
 * `resource_metadata` pointer in the challenge and fetches this document to
 * learn how to authenticate. Advertising bearer tokens here is what makes the
 * API-key flow discoverable rather than something a user has to be told about.
 */
export function GET(request: Request) {
  const origin = getPublicAppOrigin(request);

  return Response.json(
    {
      resource: getMcpResourceIdentifier(request),
      resource_name: "OpenSuiteMCP",
      resource_documentation: `${origin}/docs/mcp-server`,
      scopes_supported: ["read", "write"],
      bearer_methods_supported: ["header"],
      mcp_endpoint: getMcpServerUrl(request),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

/** Clients probe this document from a browser context, so preflight must pass. */
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "mcp-protocol-version",
    },
  });
}
