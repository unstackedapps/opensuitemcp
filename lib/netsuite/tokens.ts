import { and, eq, inArray } from "drizzle-orm";
import { db, getUserSettings } from "@/lib/db/queries";
import { netsuiteToken } from "@/lib/db/schema";
import { normalizeNetSuiteAccountId, tokenBelongsToAccount } from "./accounts";
import { refreshAccessToken } from "./oauth";

async function getActiveAccountId(userId: string): Promise<string | null> {
  const settings = await getUserSettings({ userId });
  return settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : null;
}

/**
 * Get NetSuite token for an account, refreshing if necessary.
 * Omitting accountId uses the user's saved active account.
 */
export async function getNetSuiteToken(
  userId: string,
  accountId?: string | null,
): Promise<string | null> {
  const requestedAccountId = accountId?.trim()
    ? normalizeNetSuiteAccountId(accountId)
    : null;
  const targetAccountId =
    requestedAccountId ?? (await getActiveAccountId(userId));
  if (!targetAccountId) {
    console.log(`[NetSuite] No active account for user: ${userId}`);
    return null;
  }

  const [token] = await db
    .select()
    .from(netsuiteToken)
    .where(
      and(
        eq(netsuiteToken.userId, userId),
        eq(netsuiteToken.accountId, targetAccountId),
      ),
    )
    .limit(1);

  // Legacy rows may lack accountId; accept only when resolving the active
  // account implicitly, and only if they belong to that account.
  let resolved = token;
  if (!resolved && !requestedAccountId) {
    const [legacy] = await db
      .select()
      .from(netsuiteToken)
      .where(eq(netsuiteToken.userId, userId))
      .limit(1);
    if (legacy && (!legacy.accountId || legacy.accountId === targetAccountId)) {
      resolved = legacy;
    }
  }

  if (!resolved) {
    console.log(
      `[NetSuite] No token found for user: ${userId}, account: ${targetAccountId}`,
    );
    return null;
  }

  console.log(
    `[NetSuite] Found token for user: ${userId}, account: ${targetAccountId}, expires at: ${resolved.expiresAt}`,
  );

  const now = new Date();
  const expiresAt = new Date(resolved.expiresAt);
  const buffer = 5 * 60 * 1000;

  if (expiresAt.getTime() - now.getTime() < buffer) {
    try {
      const refreshed = await refreshAccessToken({
        userId,
        refreshToken: resolved.refreshToken,
        accountId: targetAccountId,
      });
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

      await db
        .update(netsuiteToken)
        .set({
          accountId: targetAccountId,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(netsuiteToken.id, resolved.id));

      return refreshed.access_token;
    } catch (_error) {
      await db.delete(netsuiteToken).where(eq(netsuiteToken.id, resolved.id));
      return null;
    }
  }

  if (!resolved.accountId) {
    await db
      .update(netsuiteToken)
      .set({ accountId: targetAccountId, updatedAt: new Date() })
      .where(eq(netsuiteToken.id, resolved.id));
  }

  return resolved.accessToken;
}

export async function listConnectedNetSuiteAccountIds(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ accountId: netsuiteToken.accountId })
    .from(netsuiteToken)
    .where(eq(netsuiteToken.userId, userId));

  const ids: string[] = [];
  for (const row of rows) {
    if (!row.accountId?.trim()) {
      continue;
    }
    const normalized = normalizeNetSuiteAccountId(row.accountId);
    if (!ids.includes(normalized)) {
      ids.push(normalized);
    }
  }
  return ids;
}

/**
 * Save NetSuite token for a user + account
 */
export async function saveNetSuiteToken(params: {
  userId: string;
  accountId?: string | null;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + params.expiresIn * 1000);
  const now = new Date();
  const accountId =
    (params.accountId
      ? normalizeNetSuiteAccountId(params.accountId)
      : await getActiveAccountId(params.userId)) || null;

  const [existingForAccount] = accountId
    ? await db
        .select()
        .from(netsuiteToken)
        .where(
          and(
            eq(netsuiteToken.userId, params.userId),
            eq(netsuiteToken.accountId, accountId),
          ),
        )
        .limit(1)
    : [undefined];

  if (existingForAccount) {
    await db
      .update(netsuiteToken)
      .set({
        accountId,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(netsuiteToken.id, existingForAccount.id));
    return;
  }

  // Legacy rows without accountId: update in place only when we still lack
  // an account key. Never overwrite another account's token.
  if (!accountId) {
    const [existingAny] = await db
      .select()
      .from(netsuiteToken)
      .where(eq(netsuiteToken.userId, params.userId))
      .limit(1);

    if (existingAny) {
      await db
        .update(netsuiteToken)
        .set({
          accountId,
          accessToken: params.accessToken,
          refreshToken: params.refreshToken,
          expiresAt,
          updatedAt: now,
        })
        .where(eq(netsuiteToken.id, existingAny.id));
      return;
    }
  }

  await db.insert(netsuiteToken).values({
    userId: params.userId,
    accountId,
    accessToken: params.accessToken,
    refreshToken: params.refreshToken,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Delete NetSuite token for a user (optionally a specific account).
 * Account-scoped deletes also remove legacy null-accountId rows when the
 * target is the user's active account, and match unnormalized stored ids.
 */
export async function deleteNetSuiteToken(
  userId: string,
  accountId?: string | null,
): Promise<void> {
  if (!accountId) {
    await db.delete(netsuiteToken).where(eq(netsuiteToken.userId, userId));
    return;
  }

  const normalized = normalizeNetSuiteAccountId(accountId);
  const activeAccountId = await getActiveAccountId(userId);
  const rows = await db
    .select({ id: netsuiteToken.id, accountId: netsuiteToken.accountId })
    .from(netsuiteToken)
    .where(eq(netsuiteToken.userId, userId));

  const idsToDelete = rows
    .filter((row) =>
      tokenBelongsToAccount(row.accountId, normalized, activeAccountId),
    )
    .map((row) => row.id);

  if (idsToDelete.length === 0) {
    return;
  }

  await db.delete(netsuiteToken).where(inArray(netsuiteToken.id, idsToDelete));
}
