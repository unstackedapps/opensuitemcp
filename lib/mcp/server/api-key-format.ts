import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * MCP API key format: `osmcp_<tokenId>_<secret>`
 *
 * - `tokenId` is 16 hex characters and is stored in plaintext so a presented
 *   key resolves to one row with an indexed lookup instead of a table scan.
 * - `secret` is 32 random bytes, base64url encoded. Only its SHA-256 digest is
 *   stored, so a database leak does not yield usable keys.
 *
 * The secret alphabet includes `_`, so the token id is read from a fixed offset
 * rather than by splitting on the separator.
 */
export const MCP_KEY_PREFIX = "osmcp_";
const TOKEN_ID_BYTES = 8;
const TOKEN_ID_LENGTH = TOKEN_ID_BYTES * 2;
const SECRET_BYTES = 32;
const TOKEN_ID_START = MCP_KEY_PREFIX.length;
const TOKEN_ID_END = TOKEN_ID_START + TOKEN_ID_LENGTH;
const SECRET_START = TOKEN_ID_END + 1;
const HEX_TOKEN_ID = /^[0-9a-f]+$/;

export type ParsedMcpKey = {
  tokenId: string;
  secret: string;
};

export type GeneratedMcpKey = {
  /** Full key. Shown to the user once and never persisted. */
  token: string;
  tokenId: string;
  tokenHash: string;
};

/** Mint a new key. The caller stores `tokenId` + `tokenHash` only. */
export function generateMcpApiKey(): GeneratedMcpKey {
  const tokenId = randomBytes(TOKEN_ID_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return {
    token: `${MCP_KEY_PREFIX}${tokenId}_${secret}`,
    tokenId,
    tokenHash: hashMcpKeySecret(secret),
  };
}

export function hashMcpKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Parse a presented key. Returns null for anything malformed. */
export function parseMcpApiKey(token: string): ParsedMcpKey | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith(MCP_KEY_PREFIX)) {
    return null;
  }
  if (trimmed.length <= SECRET_START) {
    return null;
  }
  if (trimmed[TOKEN_ID_END] !== "_") {
    return null;
  }

  const tokenId = trimmed.slice(TOKEN_ID_START, TOKEN_ID_END);
  if (tokenId.length !== TOKEN_ID_LENGTH || !HEX_TOKEN_ID.test(tokenId)) {
    return null;
  }

  const secret = trimmed.slice(SECRET_START);
  if (!secret) {
    return null;
  }

  return { tokenId, secret };
}

/** Constant-time comparison of a presented secret against a stored digest. */
export function mcpKeySecretMatches(
  secret: string,
  tokenHash: string,
): boolean {
  const presented = Buffer.from(hashMcpKeySecret(secret), "utf8");
  const stored = Buffer.from(tokenHash, "utf8");
  if (presented.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(presented, stored);
}

/**
 * Masked form for lists and logs. The token id is not secret — it is stored in
 * plaintext — so showing it lets a user match a row to a key they hold.
 */
export function maskMcpApiKey(tokenId: string): string {
  return `${MCP_KEY_PREFIX}${tokenId}_${"•".repeat(8)}`;
}

/** Read a bearer token from an Authorization header. */
export function readBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer[ \t]+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
