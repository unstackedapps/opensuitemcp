import { MCP_SCOPE } from "@/lib/mcp/server/config";
import { readClientCredentials } from "@/lib/mcp/server/oauth/client-auth";
import {
  clientSecretMatches,
  resolveOAuthClient,
  touchOAuthClient,
} from "@/lib/mcp/server/oauth/clients";
import { consumeAuthorizationCode } from "@/lib/mcp/server/oauth/codes";
import { connectOAuthGrant } from "@/lib/mcp/server/oauth/grants";
import { oauthErrorResponse } from "@/lib/mcp/server/oauth/responses";
import {
  type IssuedTokenPair,
  issueTokenPair,
  rotateRefreshToken,
} from "@/lib/mcp/server/oauth/tokens";
import { writeOrgAuditLog } from "@/lib/org/audit";
import { allowOAuthAttempt } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The token endpoint.
 *
 * Two grants: an authorization code, exchanged once, and a refresh token, which
 * rotates on every use. There is no `client_credentials` grant — every
 * principal on this server is a person, and an agent that genuinely has no
 * person behind it wants an agent key instead.
 *
 * The body is `application/x-www-form-urlencoded`, per RFC 6749 section 4.1.3.
 * Reading it as text and parsing it here rather than relying on a JSON body
 * parser is what keeps this from answering 415 to every client in the field.
 */
export async function POST(request: Request) {
  const form = new URLSearchParams(await request.text());
  const credentials = readClientCredentials({
    authorization: request.headers.get("authorization"),
    form,
  });

  if (!credentials.clientId) {
    return fail("invalid_client", "client_id is required.", 401);
  }
  if (!(await allowOAuthAttempt(`token:${credentials.clientId}`))) {
    return fail(
      "temporarily_unavailable",
      "Too many token requests. Try again in a minute.",
      429,
    );
  }

  const resolved = await resolveOAuthClient(credentials.clientId);
  if (!resolved.ok) {
    return fail("invalid_client", resolved.description, 401);
  }
  if (!clientSecretMatches(resolved.client.row, credentials.clientSecret)) {
    return fail("invalid_client", "Client authentication failed.", 401);
  }

  const grantType = form.get("grant_type")?.trim();
  if (grantType === "authorization_code") {
    return exchangeAuthorizationCode({
      form,
      clientId: credentials.clientId,
      clientRowId: resolved.client.row.id,
    });
  }
  if (grantType === "refresh_token") {
    return exchangeRefreshToken({
      form,
      clientId: credentials.clientId,
      clientRowId: resolved.client.row.id,
    });
  }

  return fail(
    "unsupported_grant_type",
    "This server issues tokens for the authorization_code and refresh_token grants only.",
    400,
  );
}

async function exchangeAuthorizationCode(params: {
  form: URLSearchParams;
  clientId: string;
  clientRowId: string;
}): Promise<Response> {
  const code = params.form.get("code")?.trim();
  const codeVerifier = params.form.get("code_verifier")?.trim();
  if (!code) {
    return fail("invalid_request", "code is required.", 400);
  }
  if (!codeVerifier) {
    return fail(
      "invalid_request",
      "code_verifier is required. This server requires PKCE with S256.",
      400,
    );
  }

  const consumed = await consumeAuthorizationCode({
    code,
    clientId: params.clientId,
    // Only compare when the client sent one; the authorization request's value
    // is authoritative either way.
    redirectUri: params.form.get("redirect_uri")?.trim() ?? null,
    codeVerifier,
  });
  if (!consumed.ok) {
    return fail("invalid_grant", consumed.description, 400);
  }

  // The agent already exists; this only binds it to the client that asked.
  // A null here means it was revoked or claimed between consent and exchange,
  // and minting against it would hand out a token nobody can see or revoke.
  const grant = await connectOAuthGrant(consumed.code);
  if (!grant) {
    return fail(
      "invalid_grant",
      "That agent is no longer waiting to be connected. Create one in App Portal -> Agent access and try again.",
      400,
    );
  }
  const tokens = await issueTokenPair({ grantId: grant.id });
  void touchOAuthClient(params.clientRowId);

  // The consent happened on a page; the authorization exists here. This is the
  // durable fact, so this is where it is recorded. Solo installs have no org
  // to write against, exactly as key creation does not.
  if (grant.orgId) {
    await writeOrgAuditLog({
      orgId: grant.orgId,
      actorUserId: grant.userId,
      action: "mcp_oauth.grant",
      targetType: "OAuthGrant",
      targetId: grant.id,
      metadata: { name: grant.name, clientId: grant.clientId },
    });
  }

  return tokenResponse(tokens);
}

async function exchangeRefreshToken(params: {
  form: URLSearchParams;
  clientId: string;
  clientRowId: string;
}): Promise<Response> {
  const refreshToken = params.form.get("refresh_token")?.trim();
  if (!refreshToken) {
    return fail("invalid_request", "refresh_token is required.", 400);
  }

  const rotated = await rotateRefreshToken({
    refreshToken,
    clientId: params.clientId,
  });
  if (!rotated.ok) {
    // `invalid_grant` specifically, never `invalid_request`: a client keys its
    // "start a new sign-in" behaviour on this exact code.
    return fail("invalid_grant", rotated.description, 400);
  }

  void touchOAuthClient(params.clientRowId);
  return tokenResponse(rotated.tokens);
}

function tokenResponse(tokens: IssuedTokenPair): Response {
  return Response.json(
    {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: MCP_SCOPE,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...corsHeaders(),
      },
    },
  );
}

function fail(error: string, description: string, status: number): Response {
  return oauthErrorResponse({
    error,
    description,
    status,
    headers: corsHeaders(),
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
