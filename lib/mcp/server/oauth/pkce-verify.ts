import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The verifying half of PKCE, for the authorization server.
 *
 * `lib/netsuite/oauth/pkce.ts` generates a verifier and challenge for the app
 * acting as a client. This does the opposite: a challenge arrives on the
 * authorization request, the verifier arrives on the token request, and the two
 * must agree before a code becomes a token.
 *
 * Only S256 is accepted. OAuth 2.1 removed `plain`, and advertising S256 alone
 * in `code_challenge_methods_supported` is what lets a client verify support
 * before it starts the flow.
 */

export const CODE_CHALLENGE_METHOD = "S256";

/** RFC 7636 section 4.1: 43-128 characters from the unreserved set. */
const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

/** RFC 7636 section 4.2: a base64url SHA-256 digest is always 43 characters. */
const CHALLENGE_PATTERN = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeVerifier(verifier: string): boolean {
  return VERIFIER_PATTERN.test(verifier);
}

export function isValidCodeChallenge(challenge: string): boolean {
  return CHALLENGE_PATTERN.test(challenge);
}

/**
 * Compare a presented verifier against the stored challenge.
 *
 * Constant-time, because a byte-at-a-time comparison here would leak the
 * challenge of a code someone else is mid-flight on.
 */
export function verifyCodeChallenge(params: {
  verifier: string;
  challenge: string;
  method?: string | null;
}): boolean {
  const method = params.method ?? CODE_CHALLENGE_METHOD;
  if (method !== CODE_CHALLENGE_METHOD) {
    return false;
  }
  if (
    !(
      isValidCodeVerifier(params.verifier) &&
      isValidCodeChallenge(params.challenge)
    )
  ) {
    return false;
  }

  const computed = Buffer.from(
    createHash("sha256").update(params.verifier).digest("base64url"),
    "utf8",
  );
  const stored = Buffer.from(params.challenge, "utf8");
  if (computed.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(computed, stored);
}
