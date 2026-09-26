import { getPublicAppOrigin } from "@/lib/http/public-origin";
import {
  getMcpResourceIdentifier,
  getMcpServerUrl,
} from "@/lib/mcp/server/config";
import { buildProtectedResourceMetadata } from "@/lib/mcp/server/oauth/metadata";
import {
  discoveryJson,
  discoveryOptions,
} from "@/lib/mcp/server/oauth/responses";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 protected resource metadata.
 *
 * A spec-compliant client that receives a 401 from the MCP endpoint reads the
 * `resource_metadata` pointer in the challenge and fetches this document to
 * learn how to authenticate. `authorization_servers` is the field that turns
 * that into a sign-in rather than a dead end.
 */
export function GET(request: Request) {
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
