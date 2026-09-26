import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  type OAuthAuthorizationCode,
  type OAuthGrant,
  oauthClient,
  oauthGrant,
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

export type OAuthGrantSummary = {
  id: string;
  name: string;
  /** Null until a client has connected. */
  clientId: string | null;
  /** The client's own name, once one has connected. */
  clientName: string | null;
  clientUri: string | null;
  personaId: string | null;
  netsuiteAccountId: string | null;
  connectedAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  status: "pending" | "active" | "revoked";
};

function toSummary(
  row: OAuthGrant,
  clientName: string | null,
  clientUri: string | null,
): OAuthGrantSummary {
  return {
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    clientName: row.clientId ? (clientName ?? row.clientId) : null,
    clientUri,
    personaId: row.personaId,
    netsuiteAccountId: row.netsuiteAccountId,
    connectedAt: row.connectedAt,
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
          isNull(oauthGrant.clientId),
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
    return rows.map((row) =>
      toSummary(
        row.grant,
        row.client?.clientName ?? null,
        row.client?.clientUri ?? null,
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
  personaId?: string | null;
  netsuiteAccountId?: string | null;
}): Promise<OAuthGrantSummary | null> {
  const patch: {
    name?: string;
    personaId?: string | null;
    netsuiteAccountId?: string | null;
  } = {};
  if (params.name !== undefined) {
    patch.name = params.name.trim();
  }
  if (params.personaId !== undefined) {
    patch.personaId = params.personaId?.trim() || null;
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
