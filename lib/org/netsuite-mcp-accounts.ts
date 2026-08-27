import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orgNetSuiteMcpAccount, userNetSuiteMcpAccess } from "@/lib/db/schema";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";

/** Org-level NetSuite accounts allowed for MCP OAuth (not OIDC login). */
export type OrgNetSuiteMcpAccountRow = {
  id: string;
  accountId: string;
  name: string;
  oauthClientId: string | null;
  enabled: boolean;
  locked: boolean;
  integrationStatus: OrgNetSuiteMcpIntegrationStatus;
  integrationVerifiedAt: Date | null;
  integrationError: string | null;
};

export type OrgNetSuiteMcpIntegrationStatus =
  | "unknown"
  | "needs_integration"
  | "ready"
  | "connected"
  | "error";

export function rowToNetSuiteMcpAccount(
  row: typeof orgNetSuiteMcpAccount.$inferSelect,
): OrgNetSuiteMcpAccountRow {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    oauthClientId: row.oauthClientId,
    enabled: row.enabled,
    locked: row.locked,
    integrationStatus: (row.integrationStatus ??
      "unknown") as OrgNetSuiteMcpIntegrationStatus,
    integrationVerifiedAt: row.integrationVerifiedAt ?? null,
    integrationError: row.integrationError ?? null,
  };
}

export async function listOrgNetSuiteMcpAccounts(
  orgId: string,
): Promise<OrgNetSuiteMcpAccountRow[]> {
  const rows = await db
    .select()
    .from(orgNetSuiteMcpAccount)
    .where(eq(orgNetSuiteMcpAccount.orgId, orgId))
    .orderBy(orgNetSuiteMcpAccount.name);

  return rows.map(rowToNetSuiteMcpAccount);
}

export async function listEnabledOrgNetSuiteMcpAccounts(
  orgId: string,
): Promise<OrgNetSuiteMcpAccountRow[]> {
  const accounts = await listOrgNetSuiteMcpAccounts(orgId);
  return accounts.filter((account) => account.enabled && account.accountId);
}

export async function upsertOrgNetSuiteMcpAccount({
  orgId,
  accountId,
  name,
}: {
  orgId: string;
  accountId: string;
  name?: string;
}): Promise<OrgNetSuiteMcpAccountRow> {
  const normalizedAccountId = normalizeNetSuiteAccountId(accountId);
  const displayName = name?.trim() || normalizedAccountId;

  if (!normalizedAccountId) {
    throw new Error("NetSuite account ID is required.");
  }

  const [existing] = await db
    .select()
    .from(orgNetSuiteMcpAccount)
    .where(
      and(
        eq(orgNetSuiteMcpAccount.orgId, orgId),
        eq(orgNetSuiteMcpAccount.accountId, normalizedAccountId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(orgNetSuiteMcpAccount)
      .set({
        name: displayName.slice(0, 128),
        enabled: true,
      })
      .where(eq(orgNetSuiteMcpAccount.id, existing.id));

    const [updated] = await db
      .select()
      .from(orgNetSuiteMcpAccount)
      .where(eq(orgNetSuiteMcpAccount.id, existing.id))
      .limit(1);

    if (!updated) {
      throw new Error("Failed to update MCP account.");
    }
    return rowToNetSuiteMcpAccount(updated);
  }

  const [inserted] = await db
    .insert(orgNetSuiteMcpAccount)
    .values({
      orgId,
      accountId: normalizedAccountId,
      name: displayName.slice(0, 128),
      oauthClientId: null,
      enabled: true,
      locked: false,
      integrationStatus: "unknown",
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to create MCP account.");
  }

  return rowToNetSuiteMcpAccount(inserted);
}

export async function getOrgNetSuiteMcpAccountById({
  orgId,
  netsuiteMcpAccountId,
}: {
  orgId: string;
  netsuiteMcpAccountId: string;
}): Promise<OrgNetSuiteMcpAccountRow | null> {
  const [row] = await db
    .select()
    .from(orgNetSuiteMcpAccount)
    .where(
      and(
        eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId),
        eq(orgNetSuiteMcpAccount.orgId, orgId),
      ),
    )
    .limit(1);

  return row ? rowToNetSuiteMcpAccount(row) : null;
}

export async function setOrgNetSuiteMcpIntegrationStatus({
  orgId,
  netsuiteMcpAccountId,
  status,
  oauthClientId,
  error,
}: {
  orgId: string;
  netsuiteMcpAccountId: string;
  status: OrgNetSuiteMcpIntegrationStatus;
  oauthClientId?: string | null;
  error?: string | null;
}): Promise<void> {
  const updates: Partial<typeof orgNetSuiteMcpAccount.$inferInsert> = {
    integrationStatus: status,
    integrationVerifiedAt: new Date(),
    integrationError: error?.trim()?.slice(0, 512) ?? null,
  };

  if (oauthClientId !== undefined) {
    updates.oauthClientId = oauthClientId?.trim() || null;
  }

  await db
    .update(orgNetSuiteMcpAccount)
    .set(updates)
    .where(
      and(
        eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId),
        eq(orgNetSuiteMcpAccount.orgId, orgId),
      ),
    );
}

export async function updateOrgNetSuiteMcpAccountName({
  orgId,
  netsuiteMcpAccountId,
  name,
}: {
  orgId: string;
  netsuiteMcpAccountId: string;
  name: string;
}): Promise<OrgNetSuiteMcpAccountRow> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Display name is required.");
  }

  const [existing] = await db
    .select()
    .from(orgNetSuiteMcpAccount)
    .where(
      and(
        eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId),
        eq(orgNetSuiteMcpAccount.orgId, orgId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("MCP account not found.");
  }

  await db
    .update(orgNetSuiteMcpAccount)
    .set({ name: trimmed.slice(0, 128) })
    .where(eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId));

  const [updated] = await db
    .select()
    .from(orgNetSuiteMcpAccount)
    .where(eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId))
    .limit(1);

  if (!updated) {
    throw new Error("Failed to update MCP account.");
  }

  return rowToNetSuiteMcpAccount(updated);
}

export async function setOrgNetSuiteMcpAccountEnabled({
  orgId,
  netsuiteMcpAccountId,
  enabled,
}: {
  orgId: string;
  netsuiteMcpAccountId: string;
  enabled: boolean;
}): Promise<void> {
  await db
    .update(orgNetSuiteMcpAccount)
    .set({ enabled })
    .where(
      and(
        eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId),
        eq(orgNetSuiteMcpAccount.orgId, orgId),
      ),
    );
}

export async function deleteOrgNetSuiteMcpAccount({
  orgId,
  netsuiteMcpAccountId,
}: {
  orgId: string;
  netsuiteMcpAccountId: string;
}): Promise<void> {
  await db
    .delete(userNetSuiteMcpAccess)
    .where(
      eq(userNetSuiteMcpAccess.netsuiteMcpAccountId, netsuiteMcpAccountId),
    );

  await db
    .delete(orgNetSuiteMcpAccount)
    .where(
      and(
        eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId),
        eq(orgNetSuiteMcpAccount.orgId, orgId),
      ),
    );
}

export async function getOrgNetSuiteMcpAccountByAccountId(
  orgId: string,
  accountId: string,
): Promise<OrgNetSuiteMcpAccountRow | null> {
  const normalizedAccountId = normalizeNetSuiteAccountId(accountId);
  const [row] = await db
    .select()
    .from(orgNetSuiteMcpAccount)
    .where(
      and(
        eq(orgNetSuiteMcpAccount.orgId, orgId),
        eq(orgNetSuiteMcpAccount.accountId, normalizedAccountId),
      ),
    )
    .limit(1);

  return row ? rowToNetSuiteMcpAccount(row) : null;
}

export async function userHasNetSuiteMcpAccess({
  userId,
  netsuiteMcpAccountId,
}: {
  userId: string;
  netsuiteMcpAccountId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: userNetSuiteMcpAccess.id })
    .from(userNetSuiteMcpAccess)
    .where(
      and(
        eq(userNetSuiteMcpAccess.userId, userId),
        eq(userNetSuiteMcpAccess.netsuiteMcpAccountId, netsuiteMcpAccountId),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function grantUserNetSuiteMcpAccess({
  userId,
  netsuiteMcpAccountId,
}: {
  userId: string;
  netsuiteMcpAccountId: string;
}): Promise<void> {
  const existing = await userHasNetSuiteMcpAccess({
    userId,
    netsuiteMcpAccountId,
  });
  if (existing) {
    return;
  }

  await db.insert(userNetSuiteMcpAccess).values({
    userId,
    netsuiteMcpAccountId,
  });

  const { addGrantedNetSuiteMcpAccountToUserSettings } = await import(
    "@/lib/org/netsuite-mcp-user-sync"
  );
  await addGrantedNetSuiteMcpAccountToUserSettings(
    userId,
    netsuiteMcpAccountId,
  );
}

export async function revokeUserNetSuiteMcpAccess({
  userId,
  netsuiteMcpAccountId,
}: {
  userId: string;
  netsuiteMcpAccountId: string;
}): Promise<void> {
  await db
    .delete(userNetSuiteMcpAccess)
    .where(
      and(
        eq(userNetSuiteMcpAccess.userId, userId),
        eq(userNetSuiteMcpAccess.netsuiteMcpAccountId, netsuiteMcpAccountId),
      ),
    );

  const { removeNetSuiteMcpAccountFromUserSettings } = await import(
    "@/lib/org/netsuite-mcp-user-sync"
  );
  await removeNetSuiteMcpAccountFromUserSettings(userId, netsuiteMcpAccountId);
}

export async function listUserNetSuiteMcpAccountIds(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({
      netsuiteMcpAccountId: userNetSuiteMcpAccess.netsuiteMcpAccountId,
    })
    .from(userNetSuiteMcpAccess)
    .where(eq(userNetSuiteMcpAccess.userId, userId));

  return rows.map((row) => row.netsuiteMcpAccountId);
}

export async function setUserNetSuiteMcpAccess({
  userId,
  netsuiteMcpAccountIds,
}: {
  userId: string;
  netsuiteMcpAccountIds: string[];
}): Promise<void> {
  const uniqueIds = [...new Set(netsuiteMcpAccountIds)];
  const current = await listUserNetSuiteMcpAccountIds(userId);
  const toAdd = uniqueIds.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !uniqueIds.includes(id));

  for (const netsuiteMcpAccountId of toRemove) {
    await revokeUserNetSuiteMcpAccess({ userId, netsuiteMcpAccountId });
  }

  for (const netsuiteMcpAccountId of toAdd) {
    await grantUserNetSuiteMcpAccess({ userId, netsuiteMcpAccountId });
  }
}

export async function grantUserAllOrgNetSuiteMcpAccounts({
  userId,
  orgId,
}: {
  userId: string;
  orgId: string;
}): Promise<void> {
  const accounts = await listEnabledOrgNetSuiteMcpAccounts(orgId);
  for (const account of accounts) {
    await grantUserNetSuiteMcpAccess({
      userId,
      netsuiteMcpAccountId: account.id,
    });
  }
}

export async function assertUserNetSuiteMcpAccountAllowed({
  userId,
  orgId,
  accountId,
}: {
  userId: string;
  orgId: string;
  accountId: string;
}): Promise<OrgNetSuiteMcpAccountRow> {
  const enabledAccounts = await listEnabledOrgNetSuiteMcpAccounts(orgId);
  if (enabledAccounts.length === 0) {
    throw new Error(
      "No MCP connections are configured for your organization. Contact an administrator.",
    );
  }

  const mcpAccount = await getOrgNetSuiteMcpAccountByAccountId(
    orgId,
    accountId,
  );
  if (!mcpAccount || !mcpAccount.enabled) {
    throw new Error(
      "This NetSuite account is not allowed for MCP connections in your organization.",
    );
  }

  const hasAccess = await userHasNetSuiteMcpAccess({
    userId,
    netsuiteMcpAccountId: mcpAccount.id,
  });
  if (!hasAccess) {
    throw new Error(
      "You do not have access to this NetSuite MCP connection. Contact an administrator.",
    );
  }

  return mcpAccount;
}
