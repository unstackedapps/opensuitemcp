import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { type OAuthGrant, oauthGrant, oauthToken, user } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import {
  generateOAuthToken,
  oauthTokenSecretMatches,
  parseOAuthToken,
} from "./token-format";

/**
 * Access and refresh tokens, issued against a grant.
 *
 * An access token lives an hour and a refresh token sixty days, which is long
 * enough that an agent left running over a holiday still works and short enough
 * that a leaked access token is not a standing credential.
 */
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_MS / 1000;

export type IssuedTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type AuthenticatedOAuthGrant = {
  grant: OAuthGrant;
  userId: string;
  orgId: string | null;
  email: string | null;
};

export type OAuthTokenAuthFailure =
  | "malformed"
  | "unknown"
  | "expired"
  | "revoked"
  | "grant_revoked"
  | "user_disabled";

export type OAuthTokenAuthResult =
  | { ok: true; principal: AuthenticatedOAuthGrant }
  | { ok: false; reason: OAuthTokenAuthFailure };

/**
 * Mint a fresh pair against a grant.
 *
 * `rotatedFromId` carries the refresh token this pair replaced, so presenting
 * the old one later is recognisable as a replay rather than as a retry.
 */
export async function issueTokenPair(params: {
  grantId: string;
  rotatedFromId?: string | null;
}): Promise<IssuedTokenPair> {
  const access = generateOAuthToken("access");
  const refresh = generateOAuthToken("refresh");
  const now = Date.now();

  try {
    await db.insert(oauthToken).values([
      {
        grantId: params.grantId,
        kind: "access",
        tokenId: access.tokenId,
        tokenHash: access.tokenHash,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
        createdAt: new Date(),
      },
      {
        grantId: params.grantId,
        kind: "refresh",
        tokenId: refresh.tokenId,
        tokenHash: refresh.tokenHash,
        rotatedFromId: params.rotatedFromId ?? null,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
        createdAt: new Date(),
      },
    ]);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to issue the access token",
    );
  }

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Resolve a presented access token to the grant it was issued against.
 *
 * Every failure returns the same shape so the caller answers with one identical
 * 401 — a caller cannot tell "no such token" from "revoked", which is the same
 * property `authenticateMcpApiKey` has.
 */
export async function authenticateOAuthAccessToken(
  token: string,
): Promise<OAuthTokenAuthResult> {
  const parsed = parseOAuthToken(token);
  if (!parsed || parsed.kind !== "access") {
    return { ok: false, reason: "malformed" };
  }

  let row:
    | {
        token: typeof oauthToken.$inferSelect;
        grant: OAuthGrant;
        owner: { id: string; email: string; status: string };
      }
    | undefined;
  try {
    const rows = await db
      .select({ token: oauthToken, grant: oauthGrant, owner: user })
      .from(oauthToken)
      .innerJoin(oauthGrant, eq(oauthGrant.id, oauthToken.grantId))
      .innerJoin(user, eq(user.id, oauthGrant.userId))
      .where(eq(oauthToken.tokenId, parsed.tokenId))
      .limit(1);
    row = rows[0];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to verify the access token",
    );
  }

  if (!row) {
    return { ok: false, reason: "unknown" };
  }
  if (!oauthTokenSecretMatches(parsed.secret, row.token.tokenHash)) {
    return { ok: false, reason: "unknown" };
  }
  if (row.token.revokedAt) {
    return { ok: false, reason: "revoked" };
  }
  if (row.token.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (row.grant.revokedAt) {
    return { ok: false, reason: "grant_revoked" };
  }
  if (row.owner.status === "disabled") {
    return { ok: false, reason: "user_disabled" };
  }

  return {
    ok: true,
    principal: {
      grant: row.grant,
      userId: row.grant.userId,
      orgId: row.grant.orgId,
      email: row.owner.email,
    },
  };
}

export type RefreshOutcome =
  | { ok: true; grant: OAuthGrant; tokens: IssuedTokenPair }
  | { ok: false; description: string };

/**
 * Exchange a refresh token for a new pair.
 *
 * Rotation is mandatory here rather than optional: the MCP authorization spec
 * adopts OAuth 2.1's requirement for public clients, and every client that
 * registers itself or publishes a metadata document is a public client.
 *
 * Presenting an already-consumed refresh token revokes every live token on the
 * grant. The grant itself survives, so the client re-runs the sign-in flow and
 * the person is not left looking at a dead row they have to clean up.
 */
export async function rotateRefreshToken(params: {
  refreshToken: string;
  clientId: string;
}): Promise<RefreshOutcome> {
  const parsed = parseOAuthToken(params.refreshToken);
  if (!parsed || parsed.kind !== "refresh") {
    return { ok: false, description: "The refresh token is not valid." };
  }

  let row:
    | { token: typeof oauthToken.$inferSelect; grant: OAuthGrant }
    | undefined;
  try {
    const rows = await db
      .select({ token: oauthToken, grant: oauthGrant })
      .from(oauthToken)
      .innerJoin(oauthGrant, eq(oauthGrant.id, oauthToken.grantId))
      .where(eq(oauthToken.tokenId, parsed.tokenId))
      .limit(1);
    row = rows[0];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to verify the refresh token",
    );
  }

  if (!row || !oauthTokenSecretMatches(parsed.secret, row.token.tokenHash)) {
    return { ok: false, description: "The refresh token is not valid." };
  }
  if (row.grant.clientId !== params.clientId) {
    return {
      ok: false,
      description: "The refresh token was issued to a different client.",
    };
  }
  if (row.grant.revokedAt) {
    return { ok: false, description: "The authorization has been revoked." };
  }

  if (row.token.consumedAt) {
    await revokeTokensForGrant(row.grant.id);
    return {
      ok: false,
      description:
        "This refresh token was already used. Every token on this authorization has been revoked; sign in again.",
    };
  }
  if (row.token.revokedAt || row.token.expiresAt.getTime() <= Date.now()) {
    return { ok: false, description: "The refresh token has expired." };
  }

  // Claim it before issuing a successor. The guard makes two simultaneous
  // refreshes resolve to one winner rather than two live families.
  let claimed: { id: string }[];
  try {
    claimed = await db
      .update(oauthToken)
      .set({ consumedAt: new Date() })
      .where(
        and(eq(oauthToken.id, row.token.id), isNull(oauthToken.consumedAt)),
      )
      .returning({ id: oauthToken.id });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to rotate the refresh token",
    );
  }
  if (claimed.length === 0) {
    return { ok: false, description: "The refresh token is not valid." };
  }

  const tokens = await issueTokenPair({
    grantId: row.grant.id,
    rotatedFromId: row.token.id,
  });
  return { ok: true, grant: row.grant, tokens };
}

/** Revoke every live token on a grant. Used by revocation and reuse detection. */
export async function revokeTokensForGrant(grantId: string): Promise<void> {
  try {
    await db
      .update(oauthToken)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(oauthToken.grantId, grantId), isNull(oauthToken.revokedAt)),
      );
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to revoke the grant's tokens",
    );
  }
}

/**
 * RFC 7009 revocation.
 *
 * Revoking a refresh token takes the whole grant's tokens with it — the spec
 * permits it, and a client that asks to be forgotten means the agent, not one
 * hour of one credential.
 */
export async function revokeTokenByValue(params: {
  token: string;
  clientId: string;
}): Promise<void> {
  const parsed = parseOAuthToken(params.token);
  if (!parsed || parsed.kind === "code") {
    return;
  }

  let row:
    | { token: typeof oauthToken.$inferSelect; grant: OAuthGrant }
    | undefined;
  try {
    const rows = await db
      .select({ token: oauthToken, grant: oauthGrant })
      .from(oauthToken)
      .innerJoin(oauthGrant, eq(oauthGrant.id, oauthToken.grantId))
      .where(eq(oauthToken.tokenId, parsed.tokenId))
      .limit(1);
    row = rows[0];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to revoke the token",
    );
  }

  // RFC 7009 section 2.2: an unknown or mismatched token is answered with 200
  // regardless, so a caller cannot probe which tokens exist.
  if (!row || !oauthTokenSecretMatches(parsed.secret, row.token.tokenHash)) {
    return;
  }
  if (row.grant.clientId !== params.clientId) {
    return;
  }

  if (parsed.kind === "refresh") {
    await revokeTokensForGrant(row.grant.id);
    return;
  }

  try {
    await db
      .update(oauthToken)
      .set({ revokedAt: new Date() })
      .where(eq(oauthToken.id, row.token.id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to revoke the token",
    );
  }
}
