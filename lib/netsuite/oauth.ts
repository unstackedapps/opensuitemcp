import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getUserSettings } from "@/lib/db/queries";

async function getNetSuiteConfig(userId: string) {
  const settings = await getUserSettings({ userId });
  const NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const NS_REDIRECT_URI = `${NEXTAUTH_URL}/api/netsuite/callback`;

  if (!settings?.netsuiteAccountId || !settings?.netsuiteClientId) {
    return null;
  }

  return {
    NS_ACCOUNT_ID: settings.netsuiteAccountId,
    NS_INTEGRATION_CLIENT_ID: settings.netsuiteClientId,
    NS_REDIRECT_URI,
  };
}

/**
 * Generate a code verifier for PKCE (43-128 characters, URL-safe)
 */
export function generateCodeVerifier(): string {
  const length = 64;
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = randomBytes(length);
  return Array.from(randomValues, (byte) => chars[byte % chars.length]).join(
    "",
  );
}

/**
 * Generate a code challenge from a code verifier using SHA256
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Generate state parameter for CSRF protection (22-1024 characters)
 */
export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Build the authorization URL for NetSuite OAuth
 */
export async function buildAuthorizationUrl(params: {
  userId: string;
  codeChallenge: string;
  state: string;
}): Promise<string> {
  const config = await getNetSuiteConfig(params.userId);
  if (!config) {
    throw new Error(
      "NetSuite configuration is missing. Please configure your NetSuite Account ID and Client ID in Settings.",
    );
  }

  const baseUrl = config.NS_ACCOUNT_ID
    ? `https://${config.NS_ACCOUNT_ID}.app.netsuite.com/app/login/oauth2/authorize.nl`
    : "https://system.netsuite.com/app/login/oauth2/authorize.nl";

  const url = new URL(baseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.NS_INTEGRATION_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.NS_REDIRECT_URI);
  url.searchParams.set("scope", "mcp");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(params: {
  userId: string;
  code: string;
  codeVerifier: string;
  state: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  const config = await getNetSuiteConfig(params.userId);
  if (!config) {
    throw new Error(
      "NetSuite configuration is missing. Please configure your NetSuite Account ID and Client ID in Settings.",
    );
  }

  const tokenUrl = config.NS_ACCOUNT_ID
    ? `https://${config.NS_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`
    : "https://system.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token";

  const credentials = Buffer.from(
    `${config.NS_INTEGRATION_CLIENT_ID}:`,
  ).toString("base64");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: config.NS_REDIRECT_URI,
      code_verifier: params.codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>;
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(params: {
  userId: string;
  refreshToken: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  const config = await getNetSuiteConfig(params.userId);
  if (!config) {
    throw new Error(
      "NetSuite configuration is missing. Please configure your NetSuite Account ID and Client ID in Settings.",
    );
  }

  const tokenUrl = config.NS_ACCOUNT_ID
    ? `https://${config.NS_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`
    : "https://system.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token";

  const credentials = Buffer.from(
    `${config.NS_INTEGRATION_CLIENT_ID}:`,
  ).toString("base64");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>;
}

export const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});
