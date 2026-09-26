import { isPublicOriginConfigured } from "@/lib/http/public-origin";

/**
 * Response shapes shared by the OAuth endpoints.
 *
 * Discovery documents are fetched cross-origin by clients running in a browser,
 * and are read before any credential exists, so they are open to any origin.
 * Whether they may also be *cached* depends on the install — see
 * `discoveryJson`. Everything that touches a credential is `no-store`.
 */

const DISCOVERY_MAX_AGE_SECONDS = 300;

/**
 * A discovery document, cached only when its contents cannot be steered.
 *
 * Every one of these embeds this install's origin as `issuer`,
 * `token_endpoint` and friends. With `AUTH_URL` set the origin is a constant
 * and the document is safe to cache publicly. Without it the origin is derived
 * from `X-Forwarded-Host`, so a shared cache in front of the app could be
 * handed a document built from an attacker's header and serve it to real
 * clients — who would then post their authorization code and PKCE verifier to
 * whatever `token_endpoint` it named.
 *
 * So the caching follows the configuration: public when the origin is pinned,
 * uncacheable when it is guessed. `Vary` is sent either way, because a cache
 * that ignores the directive still has to be told what the body depends on.
 */
export function discoveryJson(document: object): Response {
  const pinned = isPublicOriginConfigured();
  return Response.json(document, {
    headers: {
      "Cache-Control": pinned
        ? `public, max-age=${DISCOVERY_MAX_AGE_SECONDS}`
        : "no-store",
      Vary: "Host, X-Forwarded-Host, X-Forwarded-Proto",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** Clients probe these documents from a browser context, so preflight must pass. */
export function discoveryOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "mcp-protocol-version",
    },
  });
}

/** An RFC 6749 section 5.2 error body. */
export function oauthErrorResponse(params: {
  error: string;
  description: string;
  status: number;
  headers?: Record<string, string>;
}): Response {
  return Response.json(
    { error: params.error, error_description: params.description },
    {
      status: params.status,
      headers: { "Cache-Control": "no-store", ...params.headers },
    },
  );
}
