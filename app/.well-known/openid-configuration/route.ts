import { getPublicAppOrigin } from "@/lib/http/public-origin";
import { buildAuthorizationServerMetadata } from "@/lib/mcp/server/oauth/metadata";
import {
  discoveryJson,
  discoveryOptions,
} from "@/lib/mcp/server/oauth/responses";

export const dynamic = "force-dynamic";

/**
 * The same authorization server metadata, at the OpenID Connect discovery path.
 *
 * MCP clients are required to try both this and the RFC 8414 path, and some try
 * only this one — a self-hosted install that answered 404 here would fail for
 * them with nothing in the logs to explain it. The document is identical;
 * OpenSuiteMCP is an OAuth 2.1 authorization server rather than an OpenID
 * provider, and advertises no identity claims it does not issue.
 */
export function GET(request: Request) {
  return discoveryJson(
    buildAuthorizationServerMetadata(getPublicAppOrigin(request)),
  );
}

export function OPTIONS() {
  return discoveryOptions();
}
