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
 * Standing consents.
 *
 * A grant is the OAuth counterpart of an McpApiKey row, and is presented beside
 * one in the same list: both are "an agent that can act as me", and the person
 * managing them should not have to care which handshake produced which.
 *
 * Authorizing the same client twice makes two grants rather than replacing the
 * first. A stable client id — Claude Code's, say — is the same client pinned to
 * two different subsidiaries as often as it is a duplicate, and quietly killing
 * a working agent is the worse mistake.
 */

export type OAuthGrantSummary = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  clientUri: string | null;
  personaId: string | null;
  netsuiteAccountId: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  status: "active" | "revoked";
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
    clientName: clientName ?? row.name,
    clientUri,
    personaId: row.personaId,
    netsuiteAccountId: row.netsuiteAccountId,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    status: row.revokedAt ? "revoked" : "active",
  };
}

/** Build the grant from what the person approved, not from the token request. */
export async function createOAuthGrantFromCode(
  code: OAuthAuthorizationCode,
): Promise<OAuthGrant> {
  try {
    const [row] = await db
      .insert(oauthGrant)
      .values({
        userId: code.userId,
        orgId: code.orgId,
        clientId: code.clientId,
        name: code.agentName,
        personaId: code.personaId,
        netsuiteAccountId: code.netsuiteAccountId,
        scope: code.scope,
        createdAt: new Date(),
      })
      .returning();
    return row;
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
}): Promise<OAuthGrantSummary | null> {
  const patch: { name?: string; personaId?: string | null } = {};
  if (params.name !== undefined) {
    patch.name = params.name.trim();
  }
  if (params.personaId !== undefined) {
    patch.personaId = params.personaId?.trim() || null;
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
