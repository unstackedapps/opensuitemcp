import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getUserSettings } from "@/lib/db/queries";
import {
  getNetSuiteApiHost,
  getNetSuiteAuthorizeHost,
  getNetSuiteRedirectUri,
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
} from "./accounts";

export type NetSuiteOAuthConfig = {
  NS_ACCOUNT_ID: string;
  NS_INTEGRATION_CLIENT_ID: string;
  NS_REDIRECT_URI: string;
};

async function getNetSuiteConfig(
  userId: string,
  accountId?: string | null,
): Promise<NetSuiteOAuthConfig | null> {
  const settings = await getUserSettings({ userId });
  const NS_REDIRECT_URI = getNetSuiteRedirectUri();

  const activeAccountId = settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : null;
  const requestedAccountId = accountId?.trim()
    ? normalizeNetSuiteAccountId(accountId)
    : null;
  const resolvedAccountId = requestedAccountId || activeAccountId;

  if (!resolvedAccountId) {
    return null;
  }

  const accounts = resolveNetSuiteAccounts(settings ?? {});
  const resolvedAccount = accounts.find(
    (account) => account.accountId === resolvedAccountId,
  );
  let clientId = resolvedAccount?.clientId?.trim() || "";
  if (!clientId && resolvedAccountId === activeAccountId) {
    clientId = settings?.netsuiteClientId?.trim() || "";
  }

  if (!clientId) {
    return null;
  }

  return {
    NS_ACCOUNT_ID: resolvedAccountId,
    NS_INTEGRATION_CLIENT_ID: clientId,
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
      "NetSuite configuration is missing. Add an account and Connect via Settings.",
    );
  }

  const url = new URL(
    `${getNetSuiteAuthorizeHost(config.NS_ACCOUNT_ID)}/app/login/oauth2/authorize.nl`,
  );
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
      "NetSuite configuration is missing. Add an account and Connect via Settings.",
    );
  }

  const tokenUrl = `${getNetSuiteApiHost(config.NS_ACCOUNT_ID)}/services/rest/auth/oauth2/v1/token`;
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
  accountId?: string | null;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  const config = await getNetSuiteConfig(params.userId, params.accountId);
  if (!config) {
    throw new Error(
      "NetSuite configuration is missing. Add an account and Connect via Settings.",
    );
  }

  const tokenUrl = `${getNetSuiteApiHost(config.NS_ACCOUNT_ID)}/services/rest/auth/oauth2/v1/token`;
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
