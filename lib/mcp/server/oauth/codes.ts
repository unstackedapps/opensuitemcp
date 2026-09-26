import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  type OAuthAuthorizationCode,
  oauthAuthorizationCode,
} from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { verifyCodeChallenge } from "./pkce-verify";
import {
  generateOAuthToken,
  oauthTokenSecretMatches,
  parseOAuthToken,
} from "./token-format";
import { resetOAuthGrantToPending, revokeTokensForGrant } from "./tokens";

/**
 * Authorization codes.
 *
 * A code exists for the seconds between a person clicking Authorize and the
 * client exchanging it. It names the agent they approved, so the token request
 * cannot redirect the authorization at some other agent — or invent one.
 */
const CODE_TTL_MS = 60 * 1000;

export type IssueCodeParams = {
  clientId: string;
  userId: string;
  orgId: string | null;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
  /** The waiting agent this code connects. */
  grantId: string;
};

export async function issueAuthorizationCode(
  params: IssueCodeParams,
): Promise<string> {
  const minted = generateOAuthToken("code");

  try {
    await db.insert(oauthAuthorizationCode).values({
      tokenId: minted.tokenId,
      tokenHash: minted.tokenHash,
      clientId: params.clientId,
      userId: params.userId,
      orgId: params.orgId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scope: params.scope,
      resource: params.resource,
      grantId: params.grantId,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      createdAt: new Date(),
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to issue the authorization code",
    );
  }

  return minted.token;
}

export type ConsumeCodeOutcome =
  | { ok: true; code: OAuthAuthorizationCode }
  | { ok: false; description: string };

/**
 * Exchange a code, once.
 *
 * `invalid_grant` covers every failure with one description per cause, because
 * the client is the only audience and it cannot act on the difference between
 * "no such code" and "someone else's code".
 *
 * A code presented twice is treated as theft: whatever the first exchange
 * produced is revoked, per OAuth 2.1 section 4.1.3.
 */
export async function consumeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string | null;
  codeVerifier: string;
}): Promise<ConsumeCodeOutcome> {
  const parsed = parseOAuthToken(params.code);
  if (!parsed || parsed.kind !== "code") {
    return { ok: false, description: "The authorization code is not valid." };
  }

  let row: OAuthAuthorizationCode | undefined;
  try {
    const rows = await db
      .select()
      .from(oauthAuthorizationCode)
      .where(eq(oauthAuthorizationCode.tokenId, parsed.tokenId))
      .limit(1);
    row = rows[0];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to verify the authorization code",
    );
  }

  if (!row || !oauthTokenSecretMatches(parsed.secret, row.tokenHash)) {
    return { ok: false, description: "The authorization code is not valid." };
  }
  if (row.clientId !== params.clientId) {
    return {
      ok: false,
      description: "The authorization code was issued to a different client.",
    };
  }

  if (row.expiresAt.getTime() <= Date.now() && !row.consumedAt) {
    return { ok: false, description: "The authorization code has expired." };
  }

  // RFC 6749 section 4.1.3: when the authorization request carried a
  // redirect_uri, the token request must repeat it identically.
  if (params.redirectUri !== null && params.redirectUri !== row.redirectUri) {
    return {
      ok: false,
      description: "redirect_uri does not match the authorization request.",
    };
  }

  if (
    !verifyCodeChallenge({
      verifier: params.codeVerifier,
      challenge: row.codeChallenge,
    })
  ) {
    return {
      ok: false,
      description: "The code verifier does not match the code challenge.",
    };
  }

  // Only now, with the caller having proved possession of the verifier, is a
  // second presentation treated as theft. Revoking before this point let
  // anyone holding a leaked code — and a client_id, which is public — destroy
  // the victim's live tokens without proving anything at all.
  if (row.consumedAt) {
    await revokeTokensForGrant(row.grantId);
    // The client is told to sign in again, so the agent has to be waiting for
    // it when it does.
    await resetOAuthGrantToPending(row.grantId);
    return {
      ok: false,
      description:
        "This authorization code was already used. Anything it issued has been revoked; sign in again.",
    };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, description: "The authorization code has expired." };
  }

  let claimed: OAuthAuthorizationCode[];
  try {
    claimed = await db
      .update(oauthAuthorizationCode)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(oauthAuthorizationCode.id, row.id),
          isNull(oauthAuthorizationCode.consumedAt),
        ),
      )
      .returning();
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to consume the authorization code",
    );
  }

  if (claimed.length === 0) {
    return { ok: false, description: "The authorization code is not valid." };
  }

  return { ok: true, code: claimed[0] };
}
