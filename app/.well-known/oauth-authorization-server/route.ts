import { getPublicAppOrigin } from "@/lib/http/public-origin";
import { buildAuthorizationServerMetadata } from "@/lib/mcp/server/oauth/metadata";
import {
  discoveryJson,
  discoveryOptions,
} from "@/lib/mcp/server/oauth/responses";

export const dynamic = "force-dynamic";

/**
 * RFC 8414 authorization server metadata.
 *
 * Served from the app root, because the issuer is the install's own origin.
 * That is what a client builds this URL from after reading
 * `authorization_servers` out of the protected resource metadata — and it is
 * also where Claude's connector looks whether or not it read that field.
 *
 * Deliberately not also served at `/.well-known/oauth-authorization-server/api/mcp`:
 * a client only constructs that URL if it decided the issuer is
 * `<origin>/api/mcp`, and answering with a document whose `issuer` says
 * otherwise would fail the validation every client is required to perform.
 */
export function GET(request: Request) {
  return discoveryJson(
    buildAuthorizationServerMetadata(getPublicAppOrigin(request)),
  );
}

export function OPTIONS() {
  return discoveryOptions();
}
