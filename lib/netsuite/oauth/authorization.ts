import {
  getNetSuiteApiHost,
  getNetSuiteAuthorizeHost,
  normalizeNetSuiteAccountId,
} from "@/lib/netsuite/accounts";

export type NetSuiteAuthorizationParams = {
  accountId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  state: string;
  nonce?: string;
  prompt?: "login" | "consent" | "login consent" | "consent login";
};

/** Build the NetSuite OAuth 2.0 authorization URL (PKCE). */
export function buildNetSuiteAuthorizationUrl(
  params: NetSuiteAuthorizationParams,
): string {
  const accountId = normalizeNetSuiteAccountId(params.accountId);
  const url = new URL(
    `${getNetSuiteAuthorizeHost(accountId)}/app/login/oauth2/authorize.nl`,
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scope);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (params.nonce) {
    url.searchParams.set("nonce", params.nonce);
  }

  if (params.prompt) {
    url.searchParams.set("prompt", params.prompt);
  }

  return url.toString();
}

export function getNetSuiteTokenEndpoint(accountId: string): string {
  return `${getNetSuiteApiHost(normalizeNetSuiteAccountId(accountId))}/services/rest/auth/oauth2/v1/token`;
}

export function getNetSuiteJwksUrl(accountId: string): string {
  return `${getNetSuiteApiHost(normalizeNetSuiteAccountId(accountId))}/services/rest/auth/oauth2/v1/keys`;
}

export function getNetSuiteOpenIdConfigurationUrl(accountId: string): string {
  return `${getNetSuiteApiHost(normalizeNetSuiteAccountId(accountId))}/.well-known/openid-configuration`;
}
