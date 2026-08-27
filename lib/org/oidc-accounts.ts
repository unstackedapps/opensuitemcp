import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orgNetSuiteAccount, userNetSuiteAccess } from "@/lib/db/schema";
import {
  formatNetSuiteAccountDisplay,
  normalizeNetSuiteAccountId,
} from "@/lib/netsuite/accounts";
import { getNetSuiteLoginRedirectUri } from "@/lib/netsuite/oauth/redirect-uris";
import {
  getNetSuiteAccountIdFromEnv,
  getNetSuiteOidcClientIdFromEnv,
} from "@/lib/org/install-config";
import { ensureDefaultOrg } from "@/lib/org/queries";

/** Org-level NetSuite OIDC integrations for app sign-in (not MCP). */
export type OrgOidcAccountRow = {
  id: string;
  accountId: string;
  name: string;
  oauthClientId: string | null;
  redirectUri: string | null;
  enabled: boolean;
  oidcVerifiedAt: Date | null;
};

export type OrgOidcLoginConfig = {
  orgOidcAccountId: string | null;
  accountId: string;
  clientId: string;
  redirectUri: string;
};

function rowToOidcAccount(
  row: typeof orgNetSuiteAccount.$inferSelect,
): OrgOidcAccountRow {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    oauthClientId: row.oauthClientId,
    redirectUri: row.redirectUri,
    enabled: row.enabled,
    oidcVerifiedAt: row.oidcVerifiedAt ?? null,
  };
}

function envOidcLoginConfig(): OrgOidcLoginConfig | null {
  const accountId = getNetSuiteAccountIdFromEnv();
  const clientId = getNetSuiteOidcClientIdFromEnv();
  if (!accountId || !clientId) {
    return null;
  }

  return {
    orgOidcAccountId: null,
    accountId: normalizeNetSuiteAccountId(accountId),
    clientId,
    redirectUri: getNetSuiteLoginRedirectUri(),
  };
}

export async function listOrgOidcAccounts(
  orgId: string,
): Promise<OrgOidcAccountRow[]> {
  const rows = await db
    .select()
    .from(orgNetSuiteAccount)
    .where(eq(orgNetSuiteAccount.orgId, orgId))
    .orderBy(orgNetSuiteAccount.name);

  return rows.map(rowToOidcAccount);
}

export async function listEnabledOrgOidcAccounts(
  orgId: string,
): Promise<OrgOidcAccountRow[]> {
  const accounts = await listOrgOidcAccounts(orgId);
  return accounts.filter(
    (account) =>
      account.enabled &&
      account.oauthClientId?.trim() &&
      account.accountId.trim(),
  );
}

/** Login page options: DB accounts, or env fallback when none configured yet. */
export async function listLoginOidcOptions(): Promise<
  Array<{ accountId: string; label: string }>
> {
  const defaultOrg = await ensureDefaultOrg();
  const fromDb = await listEnabledOrgOidcAccounts(defaultOrg.id);

  if (fromDb.length > 0) {
    return fromDb.map((account) => ({
      accountId: account.accountId,
      label: formatNetSuiteAccountDisplay(account),
    }));
  }

  const fromEnv = envOidcLoginConfig();
  if (!fromEnv) {
    return [];
  }

  return [{ accountId: fromEnv.accountId, label: fromEnv.accountId }];
}

export async function getOrgOidcLoginConfig(
  accountId: string,
): Promise<OrgOidcLoginConfig | null> {
  const normalizedAccountId = normalizeNetSuiteAccountId(accountId);
  const defaultOrg = await ensureDefaultOrg();

  const [row] = await db
    .select()
    .from(orgNetSuiteAccount)
    .where(
      and(
        eq(orgNetSuiteAccount.orgId, defaultOrg.id),
        eq(orgNetSuiteAccount.accountId, normalizedAccountId),
        eq(orgNetSuiteAccount.enabled, true),
      ),
    )
    .limit(1);

  const clientId = row?.oauthClientId?.trim();
  if (row && clientId) {
    return {
      orgOidcAccountId: row.id,
      accountId: normalizedAccountId,
      clientId,
      redirectUri: getNetSuiteLoginRedirectUri(),
    };
  }

  const fromEnv = envOidcLoginConfig();
  if (fromEnv && fromEnv.accountId === normalizedAccountId) {
    return fromEnv;
  }

  return null;
}

export async function isNetSuiteLoginConfigured(): Promise<boolean> {
  const options = await listLoginOidcOptions();
  return options.length > 0;
}

export async function upsertOrgOidcAccount({
  orgId,
  accountId,
  clientId,
  name,
}: {
  orgId: string;
  accountId: string;
  clientId: string;
  name?: string;
}): Promise<OrgOidcAccountRow> {
  const normalizedAccountId = normalizeNetSuiteAccountId(accountId);
  const trimmedClientId = clientId.trim();
  if (!normalizedAccountId || !trimmedClientId) {
    throw new Error("NetSuite account ID and OIDC client ID are required.");
  }

  const redirectUri = getNetSuiteLoginRedirectUri();
  const displayName = name?.trim() || normalizedAccountId;

  const [existing] = await db
    .select()
    .from(orgNetSuiteAccount)
    .where(
      and(
        eq(orgNetSuiteAccount.orgId, orgId),
        eq(orgNetSuiteAccount.accountId, normalizedAccountId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(orgNetSuiteAccount)
      .set({
        oauthClientId: trimmedClientId,
        redirectUri,
        name: displayName.slice(0, 128),
        enabled: true,
      })
      .where(eq(orgNetSuiteAccount.id, existing.id));

    const [updated] = await db
      .select()
      .from(orgNetSuiteAccount)
      .where(eq(orgNetSuiteAccount.id, existing.id))
      .limit(1);

    if (!updated) {
      throw new Error("Failed to update OIDC account.");
    }
    return rowToOidcAccount(updated);
  }

  const [inserted] = await db
    .insert(orgNetSuiteAccount)
    .values({
      orgId,
      accountId: normalizedAccountId,
      oauthClientId: trimmedClientId,
      redirectUri,
      name: displayName.slice(0, 128),
      enabled: true,
      locked: false,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to create OIDC account.");
  }

  return rowToOidcAccount(inserted);
}

export async function updateOrgOidcAccount({
  orgId,
  oidcAccountId,
  name,
  clientId,
}: {
  orgId: string;
  oidcAccountId: string;
  name: string;
  clientId?: string | null;
}): Promise<OrgOidcAccountRow> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Label is required.");
  }

  const [existing] = await db
    .select()
    .from(orgNetSuiteAccount)
    .where(
      and(
        eq(orgNetSuiteAccount.id, oidcAccountId),
        eq(orgNetSuiteAccount.orgId, orgId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("OIDC account not found.");
  }

  const updates: Partial<typeof orgNetSuiteAccount.$inferInsert> = {
    name: trimmedName.slice(0, 128),
  };

  const trimmedClientId = clientId?.trim();
  if (trimmedClientId) {
    updates.oauthClientId = trimmedClientId;
    updates.oidcVerifiedAt = null;
  }

  await db
    .update(orgNetSuiteAccount)
    .set(updates)
    .where(eq(orgNetSuiteAccount.id, oidcAccountId));

  const [updated] = await db
    .select()
    .from(orgNetSuiteAccount)
    .where(eq(orgNetSuiteAccount.id, oidcAccountId))
    .limit(1);

  if (!updated) {
    throw new Error("Failed to update OIDC account.");
  }

  return rowToOidcAccount(updated);
}

export async function markOrgOidcAccountVerifiedFromTest(
  oidcAccountId: string,
): Promise<void> {
  await db
    .update(orgNetSuiteAccount)
    .set({ oidcVerifiedAt: new Date() })
    .where(eq(orgNetSuiteAccount.id, oidcAccountId));
}

export async function setOrgOidcAccountEnabled({
  orgId,
  oidcAccountId,
  enabled,
}: {
  orgId: string;
  oidcAccountId: string;
  enabled: boolean;
}): Promise<void> {
  await db
    .update(orgNetSuiteAccount)
    .set({ enabled })
    .where(
      and(
        eq(orgNetSuiteAccount.id, oidcAccountId),
        eq(orgNetSuiteAccount.orgId, orgId),
      ),
    );
}

export async function deleteOrgOidcAccount({
  orgId,
  oidcAccountId,
}: {
  orgId: string;
  oidcAccountId: string;
}): Promise<void> {
  await db
    .delete(userNetSuiteAccess)
    .where(eq(userNetSuiteAccess.netsuiteAccountId, oidcAccountId));

  await db
    .delete(orgNetSuiteAccount)
    .where(
      and(
        eq(orgNetSuiteAccount.id, oidcAccountId),
        eq(orgNetSuiteAccount.orgId, orgId),
      ),
    );
}

export async function userHasOidcAccess({
  userId,
  orgOidcAccountId,
}: {
  userId: string;
  orgOidcAccountId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: userNetSuiteAccess.id })
    .from(userNetSuiteAccess)
    .where(
      and(
        eq(userNetSuiteAccess.userId, userId),
        eq(userNetSuiteAccess.netsuiteAccountId, orgOidcAccountId),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function grantUserOidcAccess({
  userId,
  orgOidcAccountId,
}: {
  userId: string;
  orgOidcAccountId: string;
}): Promise<void> {
  const existing = await userHasOidcAccess({ userId, orgOidcAccountId });
  if (existing) {
    return;
  }

  await db.insert(userNetSuiteAccess).values({
    userId,
    netsuiteAccountId: orgOidcAccountId,
  });
}

export async function revokeUserOidcAccess({
  userId,
  orgOidcAccountId,
}: {
  userId: string;
  orgOidcAccountId: string;
}): Promise<void> {
  await db
    .delete(userNetSuiteAccess)
    .where(
      and(
        eq(userNetSuiteAccess.userId, userId),
        eq(userNetSuiteAccess.netsuiteAccountId, orgOidcAccountId),
      ),
    );
}

export async function listUserOidcAccountIds(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ netsuiteAccountId: userNetSuiteAccess.netsuiteAccountId })
    .from(userNetSuiteAccess)
    .where(eq(userNetSuiteAccess.userId, userId));

  return rows.map((row) => row.netsuiteAccountId);
}

export async function setUserOidcAccess({
  userId,
  orgOidcAccountIds,
}: {
  userId: string;
  orgOidcAccountIds: string[];
}): Promise<void> {
  const uniqueIds = [...new Set(orgOidcAccountIds)];

  const current = await listUserOidcAccountIds(userId);
  const toAdd = uniqueIds.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !uniqueIds.includes(id));

  for (const orgOidcAccountId of toRemove) {
    await revokeUserOidcAccess({ userId, orgOidcAccountId });
  }

  for (const orgOidcAccountId of toAdd) {
    await grantUserOidcAccess({ userId, orgOidcAccountId });
  }
}

export async function grantUserAllOrgOidcAccounts({
  userId,
  orgId,
}: {
  userId: string;
  orgId: string;
}): Promise<void> {
  const accounts = await listEnabledOrgOidcAccounts(orgId);
  for (const account of accounts) {
    await grantUserOidcAccess({ userId, orgOidcAccountId: account.id });
  }
}

export function getNetSuiteLoginSetupHint(): string {
  if (
    getNetSuiteAccountIdFromEnv()?.trim() &&
    getNetSuiteOidcClientIdFromEnv()?.trim()
  ) {
    return "NetSuite OIDC was configured during install. Continue with NetSuite to finish org owner setup.";
  }
  return "Create a NetSuite OIDC Provider integration (Authorization Code Grant + Public Client) with redirect URI /api/auth/netsuite/callback. Leave integration scopes and TBA types unchecked.";
}
