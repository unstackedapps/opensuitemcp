import { readClientCredentials } from "@/lib/mcp/server/oauth/client-auth";
import {
  clientSecretMatches,
  resolveOAuthClient,
} from "@/lib/mcp/server/oauth/clients";
import { oauthErrorResponse } from "@/lib/mcp/server/oauth/responses";
import { revokeTokenByValue } from "@/lib/mcp/server/oauth/tokens";

export const dynamic = "force-dynamic";

/**
 * RFC 7009 token revocation.
 *
 * A client that is being removed calls this so its tokens stop working
 * immediately rather than lingering until they expire. Revoking a refresh token
 * takes the whole authorization's tokens with it — the spec permits that, and a
 * client saying goodbye means the agent, not one hour of one credential.
 *
 * The response is 200 whatever happened, per section 2.2, so this cannot be
 * used to discover which tokens exist.
 */
export async function POST(request: Request) {
  const form = new URLSearchParams(await request.text());
  const credentials = readClientCredentials({
    authorization: request.headers.get("authorization"),
    form,
  });

  if (!credentials.clientId) {
    return oauthErrorResponse({
      error: "invalid_client",
      description: "client_id is required.",
      status: 401,
      headers: corsHeaders(),
    });
  }

  const resolved = await resolveOAuthClient(credentials.clientId);
  if (!resolved.ok) {
    return oauthErrorResponse({
      error: "invalid_client",
      description: resolved.description,
      status: 401,
      headers: corsHeaders(),
    });
  }
  if (!clientSecretMatches(resolved.client.row, credentials.clientSecret)) {
    return oauthErrorResponse({
      error: "invalid_client",
      description: "Client authentication failed.",
      status: 401,
      headers: corsHeaders(),
    });
  }

  const token = form.get("token")?.trim();
  if (token) {
    await revokeTokenByValue({ token, clientId: credentials.clientId });
  }

  return new Response(null, {
    status: 200,
    headers: { "Cache-Control": "no-store", ...corsHeaders() },
  });
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
