import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque credential format for the authorization server.
 *
 * Deliberately the same shape as `api-key-format.ts`: a plaintext lookup id so
 * a presented credential resolves to one row on an index, and a secret whose
 * SHA-256 digest is all that is stored. Access tokens are not JWTs, which means
 * revoking a grant takes effect on the very next call rather than whenever the
 * token would have expired — the property the key path already has, and the one
 * an unattended agent's owner actually wants.
 *
 *     osmcp_at_<16 hex>_<43 url-safe>   access token
 *     osmcp_rt_<16 hex>_<43 url-safe>   refresh token
 *     osmcp_ac_<16 hex>_<43 url-safe>   authorization code
 *
 * These share the `osmcp_` prefix with an API key, so `authenticateMcpRequest`
 * must test for an OAuth token *before* it tries to parse a key. `parseMcpApiKey`
 * rejects them anyway — `at_1234…` is not 16 hex characters — but the ordering
 * is what makes that a belt rather than the only strap.
 */

export const OAUTH_TOKEN_KINDS = {
  access: "osmcp_at_",
  refresh: "osmcp_rt_",
  code: "osmcp_ac_",
} as const;

export type OAuthTokenKind = keyof typeof OAUTH_TOKEN_KINDS;

const TOKEN_ID_BYTES = 8;
const TOKEN_ID_LENGTH = TOKEN_ID_BYTES * 2;
const SECRET_BYTES = 32;
const HEX_TOKEN_ID = /^[0-9a-f]+$/;

export type ParsedOAuthToken = {
  kind: OAuthTokenKind;
  tokenId: string;
  secret: string;
};

export type GeneratedOAuthToken = {
  /** Full credential. Handed to the client once and never persisted. */
  token: string;
  tokenId: string;
  tokenHash: string;
};

/** Mint a credential. The caller stores `tokenId` + `tokenHash` only. */
export function generateOAuthToken(kind: OAuthTokenKind): GeneratedOAuthToken {
  const tokenId = randomBytes(TOKEN_ID_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return {
    token: `${OAUTH_TOKEN_KINDS[kind]}${tokenId}_${secret}`,
    tokenId,
    tokenHash: hashOAuthTokenSecret(secret),
  };
}

export function hashOAuthTokenSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Cheap prefix test, so the MCP endpoint can pick an authentication path. */
export function isOAuthToken(token: string): boolean {
  const trimmed = token.trim();
  return Object.values(OAUTH_TOKEN_KINDS).some((prefix) =>
    trimmed.startsWith(prefix),
  );
}

/** Parse a presented credential. Returns null for anything malformed. */
export function parseOAuthToken(token: string): ParsedOAuthToken | null {
  const trimmed = token.trim();

  for (const [kind, prefix] of Object.entries(OAUTH_TOKEN_KINDS) as [
    OAuthTokenKind,
    string,
  ][]) {
    if (!trimmed.startsWith(prefix)) {
      continue;
    }

    const tokenIdEnd = prefix.length + TOKEN_ID_LENGTH;
    const secretStart = tokenIdEnd + 1;
    if (trimmed.length <= secretStart || trimmed[tokenIdEnd] !== "_") {
      return null;
    }

    const tokenId = trimmed.slice(prefix.length, tokenIdEnd);
    if (tokenId.length !== TOKEN_ID_LENGTH || !HEX_TOKEN_ID.test(tokenId)) {
      return null;
    }

    const secret = trimmed.slice(secretStart);
    if (!secret) {
      return null;
    }

    return { kind, tokenId, secret };
  }

  return null;
}

/** Constant-time comparison of a presented secret against a stored digest. */
export function oauthTokenSecretMatches(
  secret: string,
  tokenHash: string,
): boolean {
  const presented = Buffer.from(hashOAuthTokenSecret(secret), "utf8");
  const stored = Buffer.from(tokenHash, "utf8");
  if (presented.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(presented, stored);
}
