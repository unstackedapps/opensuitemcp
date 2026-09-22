import "server-only";

import type { OrgRole } from "@/lib/db/schema";
import { readBearerToken } from "./api-key-format";
import { getMcpProtectedResourceUrl, isMcpServerEnabled } from "./config";
import {
  type AuthenticatedMcpKey,
  authenticateMcpApiKey,
  touchMcpApiKey,
} from "./keys";
import { resolveMcpPolicy } from "./policy";

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
  keyId: string;
  keyName: string;
  /** Account this key is pinned to; null follows the user's active account. */
  pinnedNetSuiteAccountId: string | null;
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
 * a spec-compliant client discover how to authenticate after a 401.
 */
export function mcpAuthChallengeHeader(request?: Request): string {
  const metadata = getMcpProtectedResourceUrl(request);
  return `Bearer realm="opensuitemcp", resource_metadata="${metadata}"`;
}

/**
 * Authenticate an inbound MCP request.
 *
 * Order matters: the install switch is checked before the token so a disabled
 * install reveals nothing about whether a presented key is real.
 */
export async function authenticateMcpRequest(
  request: Request,
): Promise<McpAuthOutcome> {
  if (!isMcpServerEnabled()) {
    return {
      ok: false,
      denial: {
        status: 404,
        error: "not_found",
        description: "The MCP server is not enabled on this install.",
      },
    };
  }

  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { ok: false, denial: INVALID_TOKEN };
  }

  const result = await authenticateMcpApiKey(token);
  if (!result.ok) {
    return { ok: false, denial: INVALID_TOKEN };
  }

  const policy = await resolveMcpPolicy(result.principal.orgId);
  if (!policy.enabled) {
    return {
      ok: false,
      denial: {
        status: 403,
        error: "access_denied",
        description:
          "MCP server access is disabled for this organization. Ask an administrator to enable it.",
      },
    };
  }

  return {
    ok: true,
    principal: toPrincipal(result.principal),
  };
}

function toPrincipal(authenticated: AuthenticatedMcpKey): McpPrincipal {
  return {
    userId: authenticated.userId,
    orgId: authenticated.orgId,
    role: null,
    email: authenticated.email,
    keyId: authenticated.key.id,
    keyName: authenticated.key.name,
    pinnedNetSuiteAccountId: authenticated.key.netsuiteAccountId,
  };
}

export function recordMcpKeyUse(principal: McpPrincipal): void {
  void touchMcpApiKey(principal.keyId);
}
