import "server-only";

import { and, asc, eq, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  type OAuthAuthorizationCode,
  type OAuthGrant,
  oauthClient,
  oauthGrant,
  oauthToken,
} from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { revokeTokensForGrant } from "./tokens";

/**
 * Agents that connect by signing a client in.
 *
 * A grant is the OAuth counterpart of an McpApiKey row, and is presented beside
 * one in the same list: both are "an agent that can act as me", and the person
 * managing them should not have to care which handshake produced which.
 *
 * The row is created in the portal, before any client has asked, and waits. A
 * client that completes the flow binds itself to a waiting row rather than
 * making a new one — which is the whole reason the consent screen has no
 * fields on it. Nothing is ever created from the authorization request.
 */

/**
 * How the app authenticates, for a badge its owner can read at a glance.
 *
 * `oauth-pending` is an app set to sign in that no client has reached yet — it
 * has no registration to report, and calling it DCR would be a guess.
 */
export type AgentConnectionKind =
  | "bearer"
  | "oauth-pending"
  | "oauth-dcr"
  | "oauth-cimd"
  | "oauth-client-key";

export type OAuthGrantSummary = {
  id: string;
  name: string;
  description: string | null;
  /** Which AI product this app is for. */
  connectsFrom: string | null;
  connectionKind: AgentConnectionKind;
  /** Null until a client has connected. */
  clientId: string | null;
  /** The client's own name, once one has connected. */
  clientName: string | null;
  clientUri: string | null;
  personaId: string | null;
  netsuiteAccountId: string | null;
  connectedAt: Date | null;
  /** Credentials issued from this app, for a connector that demands them. */
  issuedClientId: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  status: "pending" | "active" | "revoked";
};

function connectionKind(params: {
  issuedClientId: string | null;
  registrationKind: string | null;
  connected: boolean;
}): AgentConnectionKind {
  // Credentials issued from the app, or a client registered by hand, are both
  // "somebody pasted an id and secret" from the owner's point of view.
  if (params.issuedClientId || params.registrationKind === "manual") {
    return "oauth-client-key";
  }
  if (params.registrationKind === "cimd") {
    return "oauth-cimd";
  }
  if (params.registrationKind === "dcr") {
    return "oauth-dcr";
  }
  return params.connected ? "oauth-dcr" : "oauth-pending";
}

function toSummary(
  row: OAuthGrant,
  clientName: string | null,
  clientUri: string | null,
  issuedClientId: string | null = null,
  registrationKind: string | null = null,
): OAuthGrantSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    connectsFrom: row.connectsFrom,
    connectionKind: connectionKind({
      issuedClientId,
      registrationKind,
      connected: Boolean(row.connectedAt),
    }),
    clientId: row.clientId,
    clientName: row.clientId ? (clientName ?? row.clientId) : null,
    clientUri,
    personaId: row.personaId,
    netsuiteAccountId: row.netsuiteAccountId,
    connectedAt: row.connectedAt,
    issuedClientId,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    status: row.revokedAt ? "revoked" : row.connectedAt ? "active" : "pending",
  };
}

/**
 * Create the agent, long before any client asks for it.
 *
 * Same dialog, same fields and same limit as minting a key — the only
 * difference is that this row has no secret to hand back, and waits.
 */
export async function createPendingOAuthGrant(params: {
  userId: string;
  orgId: string | null;
  name: string;
  personaId: string | null;
  netsuiteAccountId: string | null;
  description: string | null;
  connectsFrom: string | null;
  scope: string;
}): Promise<OAuthGrantSummary> {
  try {
    const [row] = await db
      .insert(oauthGrant)
      .values({
        userId: params.userId,
        orgId: params.orgId,
        clientId: null,
        name: params.name.trim().slice(0, 128),
        description: params.description?.trim().slice(0, 256) || null,
        connectsFrom: params.connectsFrom?.trim().slice(0, 64) || null,
        personaId: params.personaId,
        netsuiteAccountId: params.netsuiteAccountId,
        scope: params.scope,
        createdAt: new Date(),
      })
      .returning();
    return toSummary(row, null, null);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create the agent",
    );
  }
}

/**
 * The agents a consent screen may offer.
 *
 * Waiting rows only. An agent that a client already connected is not offered
 * again: re-pointing a live agent at a different client would silently break
 * whatever is using it, and making a second one is the safer reading.
 */
/**
 * Every app this person may point a client at.
 *
 * Bound apps are included. A client removed at the other end never tells us,
 * so "already connected" is only ever "we issued tokens and heard nothing
 * since" — treating that as unavailable left Caleb with two apps, both bound
 * to a connector he had deleted, and no way to connect anything.
 *
 * Connecting one that is already bound replaces the binding and revokes what
 * the previous client held.
 */
export async function listConnectableOAuthGrants(
  userId: string,
): Promise<OAuthGrantSummary[]> {
  try {
    // The client's own name, so the screen can say who holds an app rather
    // than printing an opaque client id at someone.
    const rows = await db
      .select({ grant: oauthGrant, client: oauthClient })
      .from(oauthGrant)
      .leftJoin(oauthClient, eq(oauthClient.clientId, oauthGrant.clientId))
      .where(and(eq(oauthGrant.userId, userId), isNull(oauthGrant.revokedAt)))
      .orderBy(asc(oauthGrant.createdAt));
    return rows.map((row) =>
      toSummary(row.grant, row.client?.clientName ?? null, null),
    );
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list agents");
  }
}

export async function listPendingOAuthGrants(
  userId: string,
): Promise<OAuthGrantSummary[]> {
  try {
    const rows = await db
      .select()
      .from(oauthGrant)
      .where(
        and(
          eq(oauthGrant.userId, userId),
          isNull(oauthGrant.clientId),
          isNull(oauthGrant.revokedAt),
        ),
      )
      .orderBy(asc(oauthGrant.createdAt));
    return rows.map((row) => toSummary(row, null, null));
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list agents");
  }
}

/**
 * Bind a waiting agent to the client that just signed in.
 *
 * Guarded on `clientId IS NULL`, so two codes racing for the same agent leave
 * exactly one winner and the loser is told the agent is gone. Returning null
 * is the caller's cue to fail the token exchange rather than mint against a
 * row somebody else already claimed.
 */
/** Which client an app is bound to, read before a rebind replaces it. */
export async function clientIdForGrant(
  grantId: string,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ clientId: oauthGrant.clientId })
      .from(oauthGrant)
      .where(eq(oauthGrant.id, grantId))
      .limit(1);
    return row?.clientId ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to read the agent");
  }
}

/**
 * Bind an app to the client that just authorized, replacing any earlier one.
 *
 * Rebinding is allowed on purpose. A client that is removed at the other end
 * — Claude's connector, say — tells us nothing: it keeps the tokens and never
 * calls the revocation endpoint, so an app would otherwise stay bound to a
 * client that is gone and could never be connected again. Refusing here would
 * turn every app into a one-shot.
 *
 * The tokens issued to the previous client are revoked in the same breath, so
 * a rebind hands access over rather than sharing it.
 */
export async function connectOAuthGrant(
  code: OAuthAuthorizationCode,
): Promise<OAuthGrant | null> {
  try {
    const [row] = await db
      .update(oauthGrant)
      .set({ clientId: code.clientId, connectedAt: new Date() })
      .where(
        and(
          eq(oauthGrant.id, code.grantId),
          eq(oauthGrant.userId, code.userId),
          isNull(oauthGrant.revokedAt),
        ),
      )
      .returning();
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to record the authorization",
    );
  }
}

export async function listOAuthGrants(
  userId: string,
): Promise<OAuthGrantSummary[]> {
  try {
    const rows = await db
      .select({ grant: oauthGrant, client: oauthClient })
      .from(oauthGrant)
      .leftJoin(oauthClient, eq(oauthClient.clientId, oauthGrant.clientId))
      .where(eq(oauthGrant.userId, userId))
      .orderBy(asc(oauthGrant.createdAt));

    // A second pass rather than a second join: credentials issued *from* an app
    // point at it, while the client that *connected* is found through the
    // grant's own clientId. Joining both in one statement reads as a bug.
    const issued = await db
      .select({ grantId: oauthClient.grantId, clientId: oauthClient.clientId })
      .from(oauthClient)
      .where(
        and(
          eq(oauthClient.createdByUserId, userId),
          isNull(oauthClient.disabledAt),
        ),
      );
    const issuedByGrant = new Map(
      issued
        .filter((row) => row.grantId)
        .map((row) => [row.grantId as string, row.clientId]),
    );

    return rows.map((row) =>
      toSummary(
        row.grant,
        row.client?.clientName ?? null,
        row.client?.clientUri ?? null,
        issuedByGrant.get(row.grant.id) ?? null,
        row.client?.registrationKind ?? null,
      ),
    );
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list authorizations",
    );
  }
}

export async function countActiveOAuthGrants(userId: string): Promise<number> {
  try {
    const rows = await db
      .select({ id: oauthGrant.id })
      .from(oauthGrant)
      .where(and(eq(oauthGrant.userId, userId), isNull(oauthGrant.revokedAt)));
    return rows.length;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count authorizations",
    );
  }
}

/**
 * Rename a connected agent, or change the persona it acts as.
 *
 * Neither touches the tokens, so an agent already running keeps working while
 * its owner corrects a name or moves it to a different specialist — the same
 * contract `updateMcpApiKey` offers a key.
 */
export async function updateOAuthGrant(params: {
  userId: string;
  grantId: string;
  name?: string;
  description?: string | null;
  connectsFrom?: string | null;
  personaId?: string | null;
  netsuiteAccountId?: string | null;
}): Promise<OAuthGrantSummary | null> {
  const patch: {
    name?: string;
    description?: string | null;
    connectsFrom?: string | null | SQL<unknown>;
    personaId?: string | null;
    netsuiteAccountId?: string | null;
  } = {};
  if (params.name !== undefined) {
    patch.name = params.name.trim();
  }
  if (params.description !== undefined) {
    patch.description = params.description?.trim().slice(0, 256) || null;
  }
  if (params.personaId !== undefined) {
    patch.personaId = params.personaId?.trim() || null;
  }
  // Set once. An app is locked to the product it was made for, so a later
  // edit cannot silently re-point it; COALESCE fills a null and leaves any
  // existing value alone, in the same statement rather than read-then-write.
  if (params.connectsFrom !== undefined) {
    const value = params.connectsFrom?.trim().slice(0, 64) || null;
    if (value) {
      patch.connectsFrom = sql`COALESCE(${oauthGrant.connectsFrom}, ${value})`;
    }
  }
  if (params.netsuiteAccountId !== undefined) {
    patch.netsuiteAccountId = params.netsuiteAccountId?.trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    return null;
  }

  try {
    const [row] = await db
      .update(oauthGrant)
      .set(patch)
      .where(
        and(
          eq(oauthGrant.id, params.grantId),
          eq(oauthGrant.userId, params.userId),
          isNull(oauthGrant.revokedAt),
        ),
      )
      .returning();
    return row ? toSummary(row, null, null) : null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update the authorization",
    );
  }
}

/**
 * Revoke a grant and every token on it.
 *
 * The row is kept, like a revoked key's, so the audit trail and last-used time
 * survive. The agent's next call gets a 401 with a fresh challenge — which a
 * well-behaved client turns into a sign-in prompt rather than a silent failure.
 */
export async function revokeOAuthGrant(params: {
  userId: string;
  grantId: string;
}): Promise<boolean> {
  let updated: { id: string }[];
  try {
    updated = await db
      .update(oauthGrant)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthGrant.id, params.grantId),
          eq(oauthGrant.userId, params.userId),
          isNull(oauthGrant.revokedAt),
        ),
      )
      .returning({ id: oauthGrant.id });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to revoke the authorization",
    );
  }

  if (updated.length === 0) {
    return false;
  }
  await revokeTokensForGrant(params.grantId);
  return true;
}

/** Fire-and-forget, like `touchMcpApiKey`. */
export async function touchOAuthGrant(grantId: string): Promise<void> {
  try {
    await db
      .update(oauthGrant)
      .set({ lastUsedAt: new Date() })
      .where(eq(oauthGrant.id, grantId));
  } catch (error) {
    console.warn(
      "[MCP OAuth] Failed to record authorization usage:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Delete a revoked app for good.
 *
 * Only a revoked one: the row is kept after revocation so the audit trail and
 * last-used time survive, and that is right until its owner says otherwise.
 * The tokens and any issued client cascade with it.
 */
export async function deleteRevokedOAuthGrant(params: {
  userId: string;
  grantId: string;
}): Promise<boolean> {
  try {
    await db.delete(oauthToken).where(eq(oauthToken.grantId, params.grantId));
    const deleted = await db
      .delete(oauthGrant)
      .where(
        and(
          eq(oauthGrant.id, params.grantId),
          eq(oauthGrant.userId, params.userId),
          isNotNull(oauthGrant.revokedAt),
        ),
      )
      .returning({ id: oauthGrant.id });
    return deleted.length > 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete the agent app",
    );
  }
}
