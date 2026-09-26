import "server-only";

import type { OrgRole } from "@/lib/db/schema";
import { readBearerToken } from "./api-key-format";
import { getMcpProtectedResourceUrl, MCP_SCOPE } from "./config";
import {
  type AuthenticatedMcpKey,
  authenticateMcpApiKey,
  setMcpApiKeyPersona,
  touchMcpApiKey,
} from "./keys";
import { touchOAuthGrant, updateOAuthGrant } from "./oauth/grants";
import { isOAuthToken } from "./oauth/token-format";
import {
  type AuthenticatedOAuthGrant,
  authenticateOAuthAccessToken,
} from "./oauth/tokens";
import { resolveMcpPolicyForUser } from "./policy";

/**
 * The identity a tool call runs as. Deliberately mirrors `session.user` so the
 * same org-enforcement and NetSuite helpers that serve the browser serve an
 * external agent without a second authorization path to keep in sync.
 */
export type McpPrincipal = {
  userId: string;
  orgId: string | null;
  role: OrgRole | null;
  email: string | null;
  /**
   * Which handshake produced this principal. An agent handed a key and one that
   * signed in reach exactly the same surface; this only says which row to write
   * back to.
   */
  credentialKind: "key" | "oauth";
  /**
   * `McpApiKey.id` or `OAuthGrant.id`. Both are "this agent", which is why the
   * rate-limit bucket and the last-used stamp can key on it either way.
   */
  keyId: string;
  keyName: string;
  /** Account this key is pinned to; null follows the user's active account. */
  pinnedNetSuiteAccountId: string | null;
  /** Persona this agent is assigned; null means it has no assigned role. */
  personaId: string | null;
};

export type McpAuthDenial = {
  status: 401 | 403 | 404;
  error: string;
  description: string;
};

export type McpAuthOutcome =
  | { ok: true; principal: McpPrincipal }
  | { ok: false; denial: McpAuthDenial };

const INVALID_TOKEN: McpAuthDenial = {
  status: 401,
  error: "invalid_token",
  description: "The access token is missing, expired, or revoked.",
};

/**
 * RFC 9728 challenge. Pointing at the protected resource metadata is what lets
 * a spec-compliant client discover how to authenticate after a 401 — it reads
 * the document, finds the authorization server, and starts a sign-in rather
 * than asking its user to go and find a token.
 *
 * `scope` is included per RFC 6750 section 3 so the client requests exactly the
 * one scope this server issues instead of guessing from `scopes_supported`.
 */
export function mcpAuthChallengeHeader(request?: Request): string {
  const metadata = getMcpProtectedResourceUrl(request);
  return `Bearer realm="opensuitemcp", resource_metadata="${metadata}", scope="${MCP_SCOPE}"`;
}

/**
 * Authenticate an inbound MCP request.
 *
 * Two credentials reach this endpoint: an `osmcp_` agent key someone pasted,
 * and an `osmcp_at_` access token a client obtained by signing its user in.
 * They resolve to the same principal and are then subject to the same org
 * policy, which is re-read here on every call rather than trusted from the
 * moment the credential was issued.
 *
 * The OAuth prefix is tested first. Both formats begin `osmcp_`, and while
 * `parseMcpApiKey` rejects an access token on its own, ordering the branches
 * means that is a second line of defence rather than the only one.
 */
export async function authenticateMcpRequest(
  request: Request,
): Promise<McpAuthOutcome> {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { ok: false, denial: INVALID_TOKEN };
  }

  const principal = isOAuthToken(token)
    ? await principalFromAccessToken(token)
    : await principalFromApiKey(token);

  if (!principal) {
    return { ok: false, denial: INVALID_TOKEN };
  }

  const policy = await resolveMcpPolicyForUser(
    principal.orgId,
    principal.userId,
  );
  if (!policy.enabled) {
    return {
      ok: false,
      denial: {
        status: 403,
        error: "access_denied",
        description:
          "Agent access is disabled for this organization. Ask an administrator to enable it.",
      },
    };
  }

  if (!policy.memberAllowed) {
    return {
      ok: false,
      denial: {
        status: 403,
        error: "access_denied",
        description:
          "Agent access is limited to selected members of this organization, and this account is not one of them. Ask an administrator.",
      },
    };
  }

  return { ok: true, principal };
}

async function principalFromApiKey(
  token: string,
): Promise<McpPrincipal | null> {
  const result = await authenticateMcpApiKey(token);
  return result.ok ? keyPrincipal(result.principal) : null;
}

async function principalFromAccessToken(
  token: string,
): Promise<McpPrincipal | null> {
  const result = await authenticateOAuthAccessToken(token);
  return result.ok ? grantPrincipal(result.principal) : null;
}

function keyPrincipal(authenticated: AuthenticatedMcpKey): McpPrincipal {
  return {
    userId: authenticated.userId,
    orgId: authenticated.orgId,
    role: null,
    email: authenticated.email,
    credentialKind: "key",
    keyId: authenticated.key.id,
    keyName: authenticated.key.name,
    pinnedNetSuiteAccountId: authenticated.key.netsuiteAccountId,
    personaId: authenticated.key.personaId,
  };
}

function grantPrincipal(authenticated: AuthenticatedOAuthGrant): McpPrincipal {
  return {
    userId: authenticated.userId,
    orgId: authenticated.orgId,
    role: null,
    email: authenticated.email,
    credentialKind: "oauth",
    keyId: authenticated.grant.id,
    keyName: authenticated.grant.name,
    pinnedNetSuiteAccountId: authenticated.grant.netsuiteAccountId,
    personaId: authenticated.grant.personaId,
  };
}

export function recordMcpKeyUse(principal: McpPrincipal): void {
  // Both branches start their write synchronously. Deferring either one behind
  // a dynamic import would mean the request can return — and the runtime freeze
  // — before the stamp is even attempted.
  if (principal.credentialKind === "oauth") {
    void touchOAuthGrant(principal.keyId);
    return;
  }
  void touchMcpApiKey(principal.keyId);
}

/**
 * Assign or shed the persona this connection acts as.
 *
 * The persona lives on whichever row issued the credential, so the agent tools
 * that change it do not have to know which kind of agent they are serving.
 */
export async function setMcpPrincipalPersona(params: {
  principal: McpPrincipal;
  personaId: string | null;
}): Promise<boolean> {
  if (params.principal.credentialKind === "oauth") {
    const updated = await updateOAuthGrant({
      userId: params.principal.userId,
      grantId: params.principal.keyId,
      personaId: params.personaId,
    });
    return updated !== null;
  }

  return setMcpApiKeyPersona({
    userId: params.principal.userId,
    keyId: params.principal.keyId,
    personaId: params.personaId,
  });
}
