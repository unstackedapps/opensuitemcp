import {
  getNetSuiteApiHost,
  normalizeNetSuiteAccountId,
} from "@/lib/netsuite/accounts";

/** Documented iss value in NetSuite ID tokens (may differ from metadata issuer). */
export const NETSUITE_ID_TOKEN_ISSUER = "https://system.netsuite.com";

export type NetSuiteOidcMetadata = {
  issuer: string;
  jwks_uri: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
};

const metadataCache = new Map<string, Promise<NetSuiteOidcMetadata>>();

export function getNetSuiteOpenIdConfigurationUrl(accountId: string): string {
  return `${getNetSuiteApiHost(normalizeNetSuiteAccountId(accountId))}/.well-known/openid-configuration`;
}

export async function getNetSuiteOidcMetadata(
  accountId: string,
): Promise<NetSuiteOidcMetadata> {
  const normalized = normalizeNetSuiteAccountId(accountId);
  const cached = metadataCache.get(normalized);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const response = await fetch(
      getNetSuiteOpenIdConfigurationUrl(normalized),
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        `NetSuite OIDC metadata fetch failed: ${response.status}`,
      );
    }

    const metadata = (await response.json()) as NetSuiteOidcMetadata;
    if (!metadata.jwks_uri || !metadata.issuer) {
      throw new Error("NetSuite OIDC metadata is missing issuer or jwks_uri");
    }

    return metadata;
  })();

  metadataCache.set(normalized, promise);
  return promise;
}

export function getAllowedNetSuiteIdTokenIssuers(
  metadata: NetSuiteOidcMetadata,
): Set<string> {
  return new Set(
    [NETSUITE_ID_TOKEN_ISSUER, metadata.issuer].filter(
      (value): value is string => Boolean(value?.trim()),
    ),
  );
}
