import { getNetSuiteTokenEndpoint } from "./authorization";

export type NetSuiteTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeNetSuiteAuthorizationCode(params: {
  accountId: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<NetSuiteTokenResponse> {
  const tokenUrl = getNetSuiteTokenEndpoint(params.accountId);
  const credentials = Buffer.from(`${params.clientId}:`).toString("base64");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<NetSuiteTokenResponse>;
}

export async function refreshNetSuiteAccessToken(params: {
  accountId: string;
  clientId: string;
  refreshToken: string;
}): Promise<NetSuiteTokenResponse> {
  const tokenUrl = getNetSuiteTokenEndpoint(params.accountId);
  const credentials = Buffer.from(`${params.clientId}:`).toString("base64");

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
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<NetSuiteTokenResponse>;
}
