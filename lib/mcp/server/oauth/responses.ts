/**
 * Response shapes shared by the OAuth endpoints.
 *
 * Discovery documents are fetched cross-origin by clients running in a browser,
 * and are read before any credential exists, so they are public and cacheable.
 * Everything that touches a credential is `no-store`.
 */

const DISCOVERY_MAX_AGE_SECONDS = 300;

export function discoveryJson(document: object): Response {
  return Response.json(document, {
    headers: {
      "Cache-Control": `public, max-age=${DISCOVERY_MAX_AGE_SECONDS}`,
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
