export const NETSUITE_LOGIN_COOKIE = {
  codeVerifier: "ns_login_code_verifier",
  state: "ns_login_state",
  nonce: "ns_login_nonce",
  intent: "ns_login_intent",
  returnTo: "ns_login_return_to",
  proof: "ns_login_proof",
  accountId: "ns_login_account_id",
} as const;

export const NETSUITE_MCP_COOKIE = {
  codeVerifier: "netsuite_code_verifier",
  state: "netsuite_state",
  userId: "netsuite_user_id",
  accountId: "netsuite_account_id",
} as const;

export function getOAuthCookieOptions(maxAgeSeconds = 600) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: maxAgeSeconds,
    path: "/",
  };
}
