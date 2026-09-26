import { getPublicAppOrigin } from "@/lib/http/public-origin";
import { MCP_SCOPE } from "@/lib/mcp/server/config";
import { parseClientMetadata } from "@/lib/mcp/server/oauth/client-metadata";
import { registerDcrClient } from "@/lib/mcp/server/oauth/clients";
import { oauthErrorResponse } from "@/lib/mcp/server/oauth/responses";
import { allowOAuthAttempt } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * RFC 7591 dynamic client registration.
 *
 * MCP revision 2026-07-28 deprecates this in favour of Client ID Metadata
 * Documents, and it is kept because several shipping clients — Cursor and VS
 * Code among them — still register rather than publish. A client that does both
 * prefers the document, and never reaches here.
 *
 * Registration is open, as the RFC intends: a client id on its own grants
 * nothing. The gate is the consent screen, where a signed-in person decides
 * whether this client may act as them, and the org policy that is re-read on
 * every call afterwards.
 *
 * The body is JSON. The token endpoint's is form-urlencoded. That difference is
 * in RFC 7591 section 3.1 and RFC 6749 section 4.1.3 respectively, and is a
 * common source of 415s on frameworks that register one parser for both.
 */
export async function POST(request: Request) {
  if (!(await allowOAuthAttempt(`register:${clientAddress(request)}`))) {
    return oauthErrorResponse({
      error: "temporarily_unavailable",
      description: "Too many registration attempts. Try again in a minute.",
      status: 429,
      headers: corsHeaders(),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthErrorResponse({
      error: "invalid_client_metadata",
      description: "The registration request body must be JSON.",
      status: 400,
      headers: corsHeaders(),
    });
  }

  const parsed = parseClientMetadata(body, { fallbackName: "Unnamed agent" });
  if (!parsed.ok) {
    return oauthErrorResponse({
      error: parsed.error,
      description: parsed.description,
      status: 400,
      headers: corsHeaders(),
    });
  }

  const { row, clientSecret } = await registerDcrClient(parsed.metadata);

  return Response.json(
    {
      client_id: row.clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
      // 0 means the secret does not expire. A client that has to re-register on
      // a timer is a client that leaves dead rows behind.
      ...(clientSecret ? { client_secret_expires_at: 0 } : {}),
      client_name: row.clientName,
      redirect_uris: row.redirectUris,
      grant_types: row.grantTypes,
      response_types: ["code"],
      token_endpoint_auth_method: row.tokenEndpointAuthMethod,
      scope: MCP_SCOPE,
      registration_client_uri: `${getPublicAppOrigin(request)}/api/oauth/register`,
    },
    {
      status: 201,
      headers: { "Cache-Control": "no-store", ...corsHeaders() },
    },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "content-type, authorization, mcp-protocol-version",
  };
}

/** Best-effort caller identity for the rate limit; falls back to one shared bucket. */
function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
