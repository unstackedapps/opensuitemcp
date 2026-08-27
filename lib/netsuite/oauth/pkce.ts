import { createHash, randomBytes } from "node:crypto";

/** Generate a code verifier for PKCE (43-128 characters, URL-safe). */
export function generateCodeVerifier(): string {
  const length = 64;
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = randomBytes(length);
  return Array.from(randomValues, (byte) => chars[byte % chars.length]).join(
    "",
  );
}

/** Generate a code challenge from a code verifier using SHA256. */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Generate state/nonce parameters for CSRF and OIDC. */
export function generateOAuthSecret(): string {
  return randomBytes(32).toString("base64url");
}
