import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  type McpApiKey,
  mcpApiKey,
  user,
} from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import {
  generateMcpApiKey,
  maskMcpApiKey,
  mcpKeySecretMatches,
  parseMcpApiKey,
} from "./api-key-format";

/** Safe projection for lists — never includes `tokenHash`. */
export type McpApiKeySummary = {
  id: string;
  name: string;
  tokenId: string;
  maskedToken: string;
  netsuiteAccountId: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  status: "active" | "revoked" | "expired";
};

export type MintedMcpApiKey = {
  summary: McpApiKeySummary;
  /** Full key. Returned once at creation and never retrievable again. */
  token: string;
};

function keyStatus(row: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): McpApiKeySummary["status"] {
  if (row.revokedAt) {
    return "revoked";
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return "expired";
  }
  return "active";
}

function toSummary(row: McpApiKey): McpApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    tokenId: row.tokenId,
    maskedToken: maskMcpApiKey(row.tokenId),
    netsuiteAccountId: row.netsuiteAccountId,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    status: keyStatus(row),
  };
}

export async function listMcpApiKeys(
  userId: string,
): Promise<McpApiKeySummary[]> {
  try {
    const rows = await db
      .select()
      .from(mcpApiKey)
      .where(eq(mcpApiKey.userId, userId))
      .orderBy(asc(mcpApiKey.createdAt));
    return rows.map(toSummary);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list MCP API keys",
    );
  }
}

export async function countActiveMcpApiKeys(userId: string): Promise<number> {
  try {
    const rows = await db
      .select({ id: mcpApiKey.id })
      .from(mcpApiKey)
      .where(and(eq(mcpApiKey.userId, userId), isNull(mcpApiKey.revokedAt)));
    return rows.length;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count MCP API keys",
    );
  }
}

export async function createMcpApiKey(params: {
  userId: string;
  orgId: string | null;
  name: string;
  netsuiteAccountId?: string | null;
  expiresAt?: Date | null;
}): Promise<MintedMcpApiKey> {
  const minted = generateMcpApiKey();
  const pinnedAccountId = params.netsuiteAccountId?.trim()
    ? normalizeNetSuiteAccountId(params.netsuiteAccountId)
    : null;

  try {
    const [row] = await db
      .insert(mcpApiKey)
      .values({
        userId: params.userId,
        orgId: params.orgId,
        name: params.name,
        tokenId: minted.tokenId,
        tokenHash: minted.tokenHash,
        netsuiteAccountId: pinnedAccountId,
        expiresAt: params.expiresAt ?? null,
        createdAt: new Date(),
      })
      .returning();

    return { summary: toSummary(row), token: minted.token };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create an MCP API key",
    );
  }
}

/** Revoking keeps the row so the audit trail and last-used time survive. */
export async function revokeMcpApiKey(params: {
  userId: string;
  keyId: string;
}): Promise<boolean> {
  try {
    const updated = await db
      .update(mcpApiKey)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mcpApiKey.id, params.keyId),
          eq(mcpApiKey.userId, params.userId),
          isNull(mcpApiKey.revokedAt),
        ),
      )
      .returning({ id: mcpApiKey.id });
    return updated.length > 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to revoke the MCP API key",
    );
  }
}

export type AuthenticatedMcpKey = {
  key: McpApiKey;
  userId: string;
  orgId: string | null;
  email: string | null;
};

export type McpKeyAuthFailure =
  | "malformed"
  | "unknown"
  | "revoked"
  | "expired"
  | "user_disabled";

export type McpKeyAuthResult =
  | { ok: true; principal: AuthenticatedMcpKey }
  | { ok: false; reason: McpKeyAuthFailure };

/**
 * Resolve a presented bearer token to its owning user.
 *
 * Every failure mode returns the same shape and the caller answers with an
 * identical 401, so a caller cannot distinguish "no such key" from "revoked".
 */
export async function authenticateMcpApiKey(
  token: string,
): Promise<McpKeyAuthResult> {
  const parsed = parseMcpApiKey(token);
  if (!parsed) {
    return { ok: false, reason: "malformed" };
  }

  let row: McpApiKey | undefined;
  let owner: { id: string; email: string; status: string } | undefined;
  try {
    const rows = await db
      .select({ key: mcpApiKey, owner: user })
      .from(mcpApiKey)
      .innerJoin(user, eq(user.id, mcpApiKey.userId))
      .where(eq(mcpApiKey.tokenId, parsed.tokenId))
      .limit(1);
    row = rows[0]?.key;
    owner = rows[0]?.owner;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to verify the MCP API key",
    );
  }

  if (!(row && owner)) {
    return { ok: false, reason: "unknown" };
  }
  if (!mcpKeySecretMatches(parsed.secret, row.tokenHash)) {
    return { ok: false, reason: "unknown" };
  }
  if (row.revokedAt) {
    return { ok: false, reason: "revoked" };
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (owner.status === "disabled") {
    return { ok: false, reason: "user_disabled" };
  }

  return {
    ok: true,
    principal: {
      key: row,
      userId: row.userId,
      orgId: row.orgId,
      email: owner.email,
    },
  };
}

/**
 * Stamp last use. Fire-and-forget: a failure here must never fail the tool
 * call the agent actually asked for.
 */
export async function touchMcpApiKey(keyId: string): Promise<void> {
  try {
    await db
      .update(mcpApiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(mcpApiKey.id, keyId));
  } catch (error) {
    console.warn(
      "[MCP Server] Failed to record key usage:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
