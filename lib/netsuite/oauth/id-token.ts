import { createRemoteJWKSet, jwtVerify } from "jose";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import {
  getAllowedNetSuiteIdTokenIssuers,
  getNetSuiteOidcMetadata,
} from "./oidc-metadata";

export type VerifiedNetSuiteIdToken = {
  email: string;
  subject: string;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUri: string) {
  const cached = jwksCache.get(jwksUri);
  if (cached) {
    return cached;
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(jwksUri, jwks);
  return jwks;
}

function audienceMatchesClientId(aud: unknown, clientId: string): boolean {
  if (typeof aud === "string") {
    return aud.includes(clientId);
  }
  if (Array.isArray(aud)) {
    return aud.some(
      (value) => typeof value === "string" && value.includes(clientId),
    );
  }
  return false;
}

export async function verifyNetSuiteIdToken(params: {
  accountId: string;
  clientId: string;
  idToken: string;
  nonce?: string;
}): Promise<VerifiedNetSuiteIdToken> {
  const accountId = normalizeNetSuiteAccountId(params.accountId);
  const metadata = await getNetSuiteOidcMetadata(accountId);
  const allowedIssuers = getAllowedNetSuiteIdTokenIssuers(metadata);

  const { payload } = await jwtVerify(
    params.idToken,
    getJwks(metadata.jwks_uri),
  );

  const issuer = typeof payload.iss === "string" ? payload.iss : "";
  if (!allowedIssuers.has(issuer)) {
    throw new Error('unexpected "iss" claim value');
  }

  if (params.nonce && payload.nonce !== params.nonce) {
    throw new Error("NetSuite ID token nonce mismatch");
  }

  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) {
    throw new Error("NetSuite ID token is missing email");
  }

  const subject = typeof payload.sub === "string" ? payload.sub : "";
  if (!subject) {
    throw new Error("NetSuite ID token is missing subject");
  }

  if (!audienceMatchesClientId(payload.aud, params.clientId)) {
    throw new Error("NetSuite ID token audience mismatch");
  }

  return { email, subject };
}
