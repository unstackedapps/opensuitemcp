import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, getUserSettings } from "@/lib/db/queries";
import { netsuiteToken } from "@/lib/db/schema";
import { decryptStoredSecret, encrypt } from "@/lib/encryption";
import {
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
  tokenBelongsToAccount,
} from "./accounts";
import { refreshAccessToken } from "./oauth";

function encryptTokenPair(accessToken: string, refreshToken: string) {
  return {
    accessToken: encrypt(accessToken),
    refreshToken: encrypt(refreshToken),
  };
}

function readTokenSecrets(row: { accessToken: string; refreshToken: string }): {
  accessToken: string;
  refreshToken: string;
  needsReencrypt: boolean;
} | null {
  try {
    const access = decryptStoredSecret(row.accessToken);
    const refresh = decryptStoredSecret(row.refreshToken);
    if (!(access.plaintext && refresh.plaintext)) {
      return null;
    }
    return {
      accessToken: access.plaintext,
      refreshToken: refresh.plaintext,
      needsReencrypt: !(access.encrypted && refresh.encrypted),
    };
  } catch {
    return null;
  }
}

async function getAccountContext(userId: string): Promise<{
  activeAccountId: string | null;
  configuredCount: number;
}> {
  const settings = await getUserSettings({ userId });
  const accounts = resolveNetSuiteAccounts(settings ?? {});
  const fromSettings = settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : null;
  return {
    activeAccountId: fromSettings ?? accounts[0]?.accountId ?? null,
    configuredCount: accounts.length,
  };
}

async function getActiveAccountId(userId: string): Promise<string | null> {
  const context = await getAccountContext(userId);
  return context.activeAccountId;
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
  const context = await getAccountContext(userId);
  const targetAccountId = requestedAccountId ?? context.activeAccountId;
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

  // Untagged legacy rows are only safe for a single-account user. Never
  // attach them to a newly selected account once multiple accounts exist.
  let resolved = token;
  if (!resolved && context.configuredCount <= 1) {
    const [tagged] = await db
      .select({ id: netsuiteToken.id })
      .from(netsuiteToken)
      .where(
        and(
          eq(netsuiteToken.userId, userId),
          isNotNull(netsuiteToken.accountId),
        ),
      )
      .limit(1);
    if (!tagged) {
      const [legacy] = await db
        .select()
        .from(netsuiteToken)
        .where(
          and(
            eq(netsuiteToken.userId, userId),
            isNull(netsuiteToken.accountId),
          ),
        )
        .limit(1);
      if (legacy) {
        resolved = legacy;
      }
    }
  }

  if (!resolved) {
    console.log(
      `[NetSuite] No token found for user: ${userId}, account: ${targetAccountId}`,
    );
    return null;
  }

  const secrets = readTokenSecrets(resolved);
  if (!secrets) {
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
        refreshToken: secrets.refreshToken,
        accountId: targetAccountId,
      });
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

      await db
        .update(netsuiteToken)
        .set({
          accountId: targetAccountId,
          ...encryptTokenPair(refreshed.access_token, refreshed.refresh_token),
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

  if (!resolved.accountId || secrets.needsReencrypt) {
    await db
      .update(netsuiteToken)
      .set({
        accountId: targetAccountId,
        ...(secrets.needsReencrypt
          ? encryptTokenPair(secrets.accessToken, secrets.refreshToken)
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(netsuiteToken.id, resolved.id));
  }

  return secrets.accessToken;
}

export async function listConnectedNetSuiteAccountIds(
  userId: string,
): Promise<string[]> {
  const context = await getAccountContext(userId);
  const rows = await db
    .select({ accountId: netsuiteToken.accountId })
    .from(netsuiteToken)
    .where(eq(netsuiteToken.userId, userId));

  const tagged: string[] = [];
  let hasUntagged = false;
  for (const row of rows) {
    if (!row.accountId?.trim()) {
      hasUntagged = true;
      continue;
    }
    const normalized = normalizeNetSuiteAccountId(row.accountId);
    if (!tagged.includes(normalized)) {
      tagged.push(normalized);
    }
  }
  if (tagged.length > 0) {
    return tagged;
  }
  if (hasUntagged && context.configuredCount <= 1 && context.activeAccountId) {
    return [context.activeAccountId];
  }
  return [];
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
  const encrypted = encryptTokenPair(params.accessToken, params.refreshToken);

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
        ...encrypted,
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
          ...encrypted,
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
    ...encrypted,
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
