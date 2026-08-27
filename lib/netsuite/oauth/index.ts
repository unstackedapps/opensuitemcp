import { z } from "zod";
import { buildNetSuiteAuthorizationUrl } from "./authorization";
import { getMcpOAuthConfig } from "./mcp-config";
import {
  exchangeNetSuiteAuthorizationCode,
  refreshNetSuiteAccessToken,
} from "./token";

export type NetSuiteOAuthConfig = {
  NS_ACCOUNT_ID: string;
  NS_INTEGRATION_CLIENT_ID: string;
  NS_REDIRECT_URI: string;
};

export {
  buildNetSuiteAuthorizationUrl,
  getNetSuiteJwksUrl,
  getNetSuiteTokenEndpoint,
} from "./authorization";
export { verifyNetSuiteIdToken } from "./id-token";
export { getMcpOAuthConfig } from "./mcp-config";
export {
  getNetSuiteOidcMetadata,
  getNetSuiteOpenIdConfigurationUrl,
  NETSUITE_ID_TOKEN_ISSUER,
} from "./oidc-metadata";
export {
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthSecret,
  generateOAuthSecret as generateState,
} from "./pkce";
export {
  getNetSuiteLoginRedirectUri,
  getNetSuiteMcpRedirectUri,
  getNetSuiteRedirectUri,
} from "./redirect-uris";
export {
  exchangeNetSuiteAuthorizationCode,
  refreshNetSuiteAccessToken,
} from "./token";

/**
 * Build the authorization URL for NetSuite MCP connect (scope: mcp).
 */
export async function buildAuthorizationUrl(params: {
  userId: string;
  codeChallenge: string;
  state: string;
  accountId?: string | null;
}): Promise<string> {
  const config = await getMcpOAuthConfig(params.userId, params.accountId);
  if (!config) {
    throw new Error(
      "NetSuite configuration is missing. Add an account and Connect via Settings.",
    );
  }

  return buildNetSuiteAuthorizationUrl({
    accountId: config.NS_ACCOUNT_ID,
    clientId: config.NS_INTEGRATION_CLIENT_ID,
    redirectUri: config.NS_REDIRECT_URI,
    scope: "mcp",
    codeChallenge: params.codeChallenge,
    state: params.state,
  });
}

/**
 * Exchange authorization code for MCP access tokens.
 */
export async function exchangeCodeForToken(params: {
  userId: string;
  code: string;
  codeVerifier: string;
  state: string;
  accountId?: string | null;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}> {
  const config = await getMcpOAuthConfig(params.userId, params.accountId);
  if (!config) {
    throw new Error(
      "NetSuite configuration is missing. Add an account and Connect via Settings.",
    );
  }

  const tokenResponse = await exchangeNetSuiteAuthorizationCode({
    accountId: config.NS_ACCOUNT_ID,
    clientId: config.NS_INTEGRATION_CLIENT_ID,
    redirectUri: config.NS_REDIRECT_URI,
    code: params.code,
    codeVerifier: params.codeVerifier,
  });

  if (!tokenResponse.refresh_token) {
    throw new Error("NetSuite MCP token response is missing refresh_token");
  }

  return {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_in: tokenResponse.expires_in,
    token_type: tokenResponse.token_type,
  };
}

/**
 * Refresh an MCP access token using a refresh token.
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
  const config = await getMcpOAuthConfig(params.userId, params.accountId);
  if (!config) {
    throw new Error(
      "NetSuite configuration is missing. Add an account and Connect via Settings.",
    );
  }

  const tokenResponse = await refreshNetSuiteAccessToken({
    accountId: config.NS_ACCOUNT_ID,
    clientId: config.NS_INTEGRATION_CLIENT_ID,
    refreshToken: params.refreshToken,
  });

  if (!tokenResponse.refresh_token) {
    throw new Error("NetSuite MCP refresh response is missing refresh_token");
  }

  return {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_in: tokenResponse.expires_in,
    token_type: tokenResponse.token_type,
  };
}

export const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});
