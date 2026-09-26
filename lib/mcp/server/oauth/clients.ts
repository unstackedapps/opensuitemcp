import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { type OAuthClient, oauthClient } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/encryption";
import { ChatSDKError } from "@/lib/errors";
import {
  type ClientMetadata,
  isClientIdMetadataDocumentUrl,
  validateClientIdMetadataDocument,
} from "./client-metadata";
import { hashOAuthTokenSecret, oauthTokenSecretMatches } from "./token-format";

/**
 * Client records for the authorization server.
 *
 * Whichever way a client arrives — it registered itself, it published a
 * metadata document, or a person created it by hand — it ends up as one row
 * here, and everything downstream treats them alike.
 */

const CLIENT_ID_PREFIX = "osmcp_client_";
const CLIENT_SECRET_PREFIX = "osmcp_csec_";

/**
 * A metadata document is fetched over the network while a person waits on a
 * consent screen, and Claude gives the whole authorization step ten seconds.
 */
const CIMD_FETCH_TIMEOUT_MS = 5000;
const CIMD_DEFAULT_TTL_MS = 60 * 60 * 1000;
const CIMD_MIN_TTL_MS = 5 * 60 * 1000;
const CIMD_MAX_TTL_MS = 24 * 60 * 60 * 1000;

export type ResolvedOAuthClient = {
  row: OAuthClient;
  metadata: ClientMetadata;
};

export type OAuthClientSummary = {
  id: string;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  /** Whether the secret can still be copied back. */
  copyable: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type ClientResolutionFailure = {
  error: "invalid_client" | "invalid_client_metadata";
  description: string;
};

export type ClientResolution =
  | { ok: true; client: ResolvedOAuthClient }
  | ({ ok: false } & ClientResolutionFailure);

function toMetadata(row: OAuthClient): ClientMetadata {
  return {
    clientName: row.clientName,
    clientUri: row.clientUri,
    logoUri: row.logoUri,
    redirectUris: row.redirectUris,
    grantTypes: row.grantTypes,
    responseTypes: ["code"],
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
    scope: null,
    softwareId: row.softwareId,
  };
}

export function toOAuthClientSummary(row: OAuthClient): OAuthClientSummary {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    redirectUris: row.redirectUris,
    copyable: Boolean(row.clientSecretCipher),
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

async function findByClientId(
  clientId: string,
): Promise<OAuthClient | undefined> {
  try {
    const rows = await db
      .select()
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId))
      .limit(1);
    return rows[0];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to read the OAuth client",
    );
  }
}

/**
 * Resolve a `client_id` presented on an authorization or token request.
 *
 * A URL means a Client ID Metadata Document: it is fetched, validated against
 * the URL it came from, and cached as a row. Anything else must already be a
 * client we issued.
 */
export async function resolveOAuthClient(
  clientId: string,
): Promise<ClientResolution> {
  const trimmed = clientId.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "invalid_client",
      description: "client_id is required.",
    };
  }

  if (isClientIdMetadataDocumentUrl(trimmed)) {
    return resolveClientIdMetadataDocument(trimmed);
  }

  const row = await findByClientId(trimmed);
  if (!row || row.disabledAt) {
    return {
      ok: false,
      error: "invalid_client",
      description: "No such client is registered with this install.",
    };
  }
  return { ok: true, client: { row, metadata: toMetadata(row) } };
}

function cacheTtlFromHeaders(headers: Headers): number {
  const cacheControl = headers.get("cache-control") ?? "";
  const maxAge = /max-age=(\d+)/i.exec(cacheControl);
  if (maxAge?.[1]) {
    const ms = Number.parseInt(maxAge[1], 10) * 1000;
    if (Number.isFinite(ms) && ms > 0) {
      return Math.min(Math.max(ms, CIMD_MIN_TTL_MS), CIMD_MAX_TTL_MS);
    }
  }
  return CIMD_DEFAULT_TTL_MS;
}

async function resolveClientIdMetadataDocument(
  url: string,
): Promise<ClientResolution> {
  const cached = await findByClientId(url);
  const now = Date.now();

  // Refusing here rather than in the cache check: re-fetching the document
  // would otherwise quietly re-enable a client someone disabled, since the
  // document says nothing about this install's opinion of it.
  if (cached?.disabledAt) {
    return {
      ok: false,
      error: "invalid_client",
      description: "This client has been removed from this install.",
    };
  }

  if (
    cached &&
    cached.metadataExpiresAt &&
    cached.metadataExpiresAt.getTime() > now
  ) {
    return { ok: true, client: { row: cached, metadata: toMetadata(cached) } };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(CIMD_FETCH_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (_error) {
    // A stale cache beats failing the sign-in outright: the document was valid
    // when we last read it, and the client's identity has not changed.
    if (cached && !cached.disabledAt) {
      return {
        ok: true,
        client: { row: cached, metadata: toMetadata(cached) },
      };
    }
    return {
      ok: false,
      error: "invalid_client",
      description: "The client's metadata document could not be reached.",
    };
  }

  if (!response.ok) {
    if (cached && !cached.disabledAt) {
      return {
        ok: true,
        client: { row: cached, metadata: toMetadata(cached) },
      };
    }
    return {
      ok: false,
      error: "invalid_client",
      description: `The client's metadata document returned ${response.status}.`,
    };
  }

  let document: unknown;
  try {
    document = await response.json();
  } catch {
    return {
      ok: false,
      error: "invalid_client_metadata",
      description: "The client's metadata document is not valid JSON.",
    };
  }

  const validated = validateClientIdMetadataDocument({ url, document });
  if (!validated.ok) {
    return {
      ok: false,
      error:
        validated.error === "invalid_redirect_uri"
          ? "invalid_client_metadata"
          : "invalid_client_metadata",
      description: validated.description,
    };
  }

  const expiresAt = new Date(now + cacheTtlFromHeaders(response.headers));
  const row = await upsertCimdClient({
    url,
    metadata: validated.metadata,
    expiresAt,
    existingId: cached?.id,
  });

  return { ok: true, client: { row, metadata: validated.metadata } };
}

async function upsertCimdClient(params: {
  url: string;
  metadata: ClientMetadata;
  expiresAt: Date;
  existingId?: string;
}): Promise<OAuthClient> {
  const values = {
    clientName: params.metadata.clientName,
    clientUri: params.metadata.clientUri,
    logoUri: params.metadata.logoUri,
    redirectUris: params.metadata.redirectUris,
    grantTypes: params.metadata.grantTypes,
    // A CIMD client always authenticates as a public client at the token
    // endpoint, whatever its document says, because there is no secret to hold.
    tokenEndpointAuthMethod: "none" as const,
    softwareId: params.metadata.softwareId,
    metadataFetchedAt: new Date(),
    metadataExpiresAt: params.expiresAt,
  };

  try {
    if (params.existingId) {
      const [row] = await db
        .update(oauthClient)
        .set(values)
        .where(eq(oauthClient.id, params.existingId))
        .returning();
      return row;
    }
    const [row] = await db
      .insert(oauthClient)
      .values({
        ...values,
        clientId: params.url,
        registrationKind: "cimd",
        createdAt: new Date(),
      })
      .returning();
    return row;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to cache the client metadata document",
    );
  }
}

/**
 * RFC 7591 dynamic registration.
 *
 * Deprecated by MCP revision 2026-07-28 in favour of metadata documents, and
 * kept because several shipping clients still do only this.
 */
export async function registerDcrClient(
  metadata: ClientMetadata,
): Promise<{ row: OAuthClient; clientSecret: string | null }> {
  const clientId = `${CLIENT_ID_PREFIX}${randomBytes(16).toString("hex")}`;
  const isPublic = metadata.tokenEndpointAuthMethod === "none";
  const clientSecret = isPublic
    ? null
    : `${CLIENT_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;

  try {
    const [row] = await db
      .insert(oauthClient)
      .values({
        clientId,
        clientSecretHash: clientSecret
          ? hashOAuthTokenSecret(clientSecret)
          : null,
        clientName: metadata.clientName,
        clientUri: metadata.clientUri,
        logoUri: metadata.logoUri,
        redirectUris: metadata.redirectUris,
        grantTypes: metadata.grantTypes,
        tokenEndpointAuthMethod: metadata.tokenEndpointAuthMethod,
        registrationKind: "dcr",
        softwareId: metadata.softwareId,
        createdAt: new Date(),
      })
      .returning();
    return { row, clientSecret };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to register the OAuth client",
    );
  }
}

/**
 * A client a person created in the App Portal.
 *
 * This is the path for a connector that asks for a client id and secret rather
 * than discovering one — Claude's advanced settings, and anything else built
 * before registration was automatic. The secret is stored encrypted as well as
 * hashed, for the same reason an agent key is: losing it to a dismissed dialog
 * is a worse outcome than the narrow reversibility it buys.
 */
export async function createManualOAuthClient(params: {
  userId: string;
  orgId: string | null;
  clientName: string;
  redirectUris: string[];
}): Promise<{
  summary: OAuthClientSummary;
  clientId: string;
  clientSecret: string;
}> {
  const clientId = `${CLIENT_ID_PREFIX}${randomBytes(16).toString("hex")}`;
  const clientSecret = `${CLIENT_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;

  try {
    const [row] = await db
      .insert(oauthClient)
      .values({
        clientId,
        clientSecretHash: hashOAuthTokenSecret(clientSecret),
        clientSecretCipher: encrypt(clientSecret),
        clientName: params.clientName,
        redirectUris: params.redirectUris,
        grantTypes: ["authorization_code", "refresh_token"],
        // Optional: a connector that leaves the secret blank is treated as a
        // public client, which the token endpoint allows for this method.
        tokenEndpointAuthMethod: "client_secret_post",
        registrationKind: "manual",
        createdByUserId: params.userId,
        orgId: params.orgId,
        createdAt: new Date(),
      })
      .returning();
    return { summary: toOAuthClientSummary(row), clientId, clientSecret };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create the OAuth client",
    );
  }
}

export async function listManualOAuthClients(
  userId: string,
): Promise<OAuthClientSummary[]> {
  try {
    const rows = await db
      .select()
      .from(oauthClient)
      .where(
        and(
          eq(oauthClient.createdByUserId, userId),
          eq(oauthClient.registrationKind, "manual"),
          isNull(oauthClient.disabledAt),
        ),
      )
      .orderBy(asc(oauthClient.createdAt));
    return rows.map(toOAuthClientSummary);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list OAuth clients",
    );
  }
}

export async function revealManualOAuthClientSecret(params: {
  userId: string;
  id: string;
}): Promise<string | null> {
  try {
    const [row] = await db
      .select({ cipher: oauthClient.clientSecretCipher })
      .from(oauthClient)
      .where(
        and(
          eq(oauthClient.id, params.id),
          eq(oauthClient.createdByUserId, params.userId),
          isNull(oauthClient.disabledAt),
        ),
      )
      .limit(1);
    return row?.cipher ? decrypt(row.cipher) : null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to read the OAuth client secret",
    );
  }
}

/** Disabling keeps the row, so a grant made with it still names its client. */
export async function disableManualOAuthClient(params: {
  userId: string;
  id: string;
}): Promise<boolean> {
  try {
    const updated = await db
      .update(oauthClient)
      .set({ disabledAt: new Date() })
      .where(
        and(
          eq(oauthClient.id, params.id),
          eq(oauthClient.createdByUserId, params.userId),
          isNull(oauthClient.disabledAt),
        ),
      )
      .returning({ id: oauthClient.id });
    return updated.length > 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to remove the OAuth client",
    );
  }
}

/**
 * Authenticate a client at the token endpoint.
 *
 * A public client presents no secret and is accepted on its id alone — PKCE is
 * what binds the exchange to whoever started the flow. A confidential client
 * must present the secret it was issued.
 */
export function clientSecretMatches(
  row: OAuthClient,
  presented: string | null,
): boolean {
  if (!row.clientSecretHash) {
    return true;
  }
  if (!presented) {
    return false;
  }
  return oauthTokenSecretMatches(presented, row.clientSecretHash);
}

/** Fire-and-forget: a failure here must not fail the flow it was observing. */
export async function touchOAuthClient(id: string): Promise<void> {
  try {
    await db
      .update(oauthClient)
      .set({ lastUsedAt: new Date() })
      .where(eq(oauthClient.id, id));
  } catch (error) {
    console.warn(
      "[MCP OAuth] Failed to record client usage:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
