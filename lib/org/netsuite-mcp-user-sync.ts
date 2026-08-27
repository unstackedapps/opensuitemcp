import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { orgNetSuiteMcpAccount } from "@/lib/db/schema";
import type { NetSuiteAccountEntry } from "@/lib/netsuite/accounts";
import {
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
  upsertAccountEntry,
} from "@/lib/netsuite/accounts";
import { isOrgInstallMode } from "@/lib/org/install-config";
import {
  listEnabledOrgNetSuiteMcpAccounts,
  listUserNetSuiteMcpAccountIds,
  type OrgNetSuiteMcpAccountRow,
  rowToNetSuiteMcpAccount,
} from "@/lib/org/netsuite-mcp-accounts";

export type OrgNetSuiteMcpUserPolicy = {
  /** Org has an MCP allowlist; users only see granted org accounts. */
  managedByOrg: boolean;
  /** Users can add arbitrary NetSuite account IDs (solo / no org catalog). */
  allowFreeAdd: boolean;
  /** Account IDs users cannot remove from their list (all org-granted accounts). */
  lockedAccountIds: string[];
  /** Unused when org-managed; grants are auto-synced. */
  addableAccounts: NetSuiteAccountEntry[];
};

const PERSONAL_POLICY: OrgNetSuiteMcpUserPolicy = {
  managedByOrg: false,
  allowFreeAdd: true,
  lockedAccountIds: [],
  addableAccounts: [],
};

/** Org admin display name for a NetSuite MCP account (nickname in user settings). */
export function orgNetSuiteMcpAccountLabel(
  row: Pick<OrgNetSuiteMcpAccountRow, "accountId" | "name">,
): string {
  const accountId = normalizeNetSuiteAccountId(row.accountId);
  return row.name.trim() || accountId;
}

function orgRowToEntry(
  row: OrgNetSuiteMcpAccountRow,
  existing?: NetSuiteAccountEntry,
): NetSuiteAccountEntry {
  const accountId = normalizeNetSuiteAccountId(row.accountId);
  return {
    accountId,
    label: orgNetSuiteMcpAccountLabel(row),
    clientId: existing?.clientId ?? row.oauthClientId ?? null,
  };
}

function accountsEqual(
  a: NetSuiteAccountEntry[],
  b: NetSuiteAccountEntry[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const mapB = new Map(b.map((entry) => [entry.accountId, entry]));
  for (const entry of a) {
    const other = mapB.get(entry.accountId);
    if (!other) {
      return false;
    }
    if (
      entry.label !== other.label ||
      (entry.clientId ?? null) !== (other.clientId ?? null)
    ) {
      return false;
    }
  }
  return true;
}

export async function resolveOrgNetSuiteMcpUserPolicy({
  orgId,
  userId,
}: {
  orgId: string;
  userId: string;
}): Promise<OrgNetSuiteMcpUserPolicy> {
  if (!isOrgInstallMode()) {
    return PERSONAL_POLICY;
  }

  const enabledOrgAccounts = await listEnabledOrgNetSuiteMcpAccounts(orgId);
  if (enabledOrgAccounts.length === 0) {
    return PERSONAL_POLICY;
  }

  const grantIds = new Set(await listUserNetSuiteMcpAccountIds(userId));
  const granted = enabledOrgAccounts.filter((account) =>
    grantIds.has(account.id),
  );

  const lockedAccountIds = granted.map((account) =>
    normalizeNetSuiteAccountId(account.accountId),
  );

  return {
    managedByOrg: true,
    allowFreeAdd: false,
    lockedAccountIds,
    addableAccounts: [],
  };
}

/**
 * Merge org-granted MCP accounts into the user's NetSuite account list.
 * All granted enabled accounts are always present; disable removes them from the org catalog.
 */
export async function syncUserNetSuiteMcpAccountsWithOrg({
  orgId,
  userId,
  userAccounts,
}: {
  orgId: string;
  userId: string;
  userAccounts: NetSuiteAccountEntry[];
}): Promise<{
  accounts: NetSuiteAccountEntry[];
  policy: OrgNetSuiteMcpUserPolicy;
  accountsChanged: boolean;
}> {
  if (!isOrgInstallMode()) {
    return {
      accounts: userAccounts,
      policy: PERSONAL_POLICY,
      accountsChanged: false,
    };
  }

  const enabledOrgAccounts = await listEnabledOrgNetSuiteMcpAccounts(orgId);
  if (enabledOrgAccounts.length === 0) {
    return {
      accounts: userAccounts,
      policy: PERSONAL_POLICY,
      accountsChanged: false,
    };
  }

  const grantIds = new Set(await listUserNetSuiteMcpAccountIds(userId));
  const granted = enabledOrgAccounts.filter((account) =>
    grantIds.has(account.id),
  );
  const grantedIds = new Set(
    granted.map((account) => normalizeNetSuiteAccountId(account.accountId)),
  );

  const byId = new Map<string, NetSuiteAccountEntry>();
  for (const entry of userAccounts) {
    const id = normalizeNetSuiteAccountId(entry.accountId);
    if (!grantedIds.has(id)) {
      continue;
    }
    byId.set(id, {
      accountId: id,
      label: entry.label,
      clientId: entry.clientId ?? null,
    });
  }

  for (const orgAccount of granted) {
    const id = normalizeNetSuiteAccountId(orgAccount.accountId);
    byId.set(id, orgRowToEntry(orgAccount, byId.get(id)));
  }

  const accounts = [...byId.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  const policy = await resolveOrgNetSuiteMcpUserPolicy({
    orgId,
    userId,
  });

  return {
    accounts,
    policy,
    accountsChanged: !accountsEqual(userAccounts, accounts),
  };
}

export function mergeAccountLists(
  accounts: NetSuiteAccountEntry[],
  toAdd: NetSuiteAccountEntry[],
): NetSuiteAccountEntry[] {
  let merged = accounts;
  for (const entry of toAdd) {
    merged = upsertAccountEntry(merged, entry);
  }
  return merged.sort((a, b) => a.label.localeCompare(b.label));
}

export async function validateOrgNetSuiteMcpAccountsPatch({
  orgId,
  userId,
  nextAccounts,
}: {
  orgId: string;
  userId: string;
  nextAccounts: NetSuiteAccountEntry[];
}): Promise<void> {
  if (!isOrgInstallMode()) {
    return;
  }

  const enabledOrgAccounts = await listEnabledOrgNetSuiteMcpAccounts(orgId);
  if (enabledOrgAccounts.length === 0) {
    return;
  }

  const grantIds = new Set(await listUserNetSuiteMcpAccountIds(userId));
  const granted = enabledOrgAccounts.filter((account) =>
    grantIds.has(account.id),
  );
  const allowedIds = new Set(
    granted.map((account) => normalizeNetSuiteAccountId(account.accountId)),
  );

  for (const account of nextAccounts) {
    const id = normalizeNetSuiteAccountId(account.accountId);
    if (!allowedIds.has(id)) {
      throw new Error(
        "This NetSuite account is not allowed for MCP connections in your organization.",
      );
    }
  }

  for (const orgAccount of granted) {
    const id = normalizeNetSuiteAccountId(orgAccount.accountId);
    const stillPresent = nextAccounts.some(
      (account) => normalizeNetSuiteAccountId(account.accountId) === id,
    );
    if (!stillPresent) {
      throw new Error(
        `Account ${orgAccount.name} is assigned by your organization and cannot be removed.`,
      );
    }

    const next = nextAccounts.find(
      (account) => normalizeNetSuiteAccountId(account.accountId) === id,
    );
    if (next && next.label.trim() !== orgNetSuiteMcpAccountLabel(orgAccount)) {
      throw new Error(
        "NetSuite connection nicknames are managed by your organization.",
      );
    }
  }
}

/** Force org MCP nicknames onto user account rows (org-managed grants only). */
export async function enforceOrgNetSuiteMcpAccountLabels({
  orgId,
  userId,
  accounts,
}: {
  orgId: string;
  userId: string;
  accounts: NetSuiteAccountEntry[];
}): Promise<NetSuiteAccountEntry[]> {
  if (!isOrgInstallMode()) {
    return accounts;
  }

  const enabledOrgAccounts = await listEnabledOrgNetSuiteMcpAccounts(orgId);
  if (enabledOrgAccounts.length === 0) {
    return accounts;
  }

  const grantIds = new Set(await listUserNetSuiteMcpAccountIds(userId));
  const grantedByAccountId = new Map(
    enabledOrgAccounts
      .filter((account) => grantIds.has(account.id))
      .map((account) => [
        normalizeNetSuiteAccountId(account.accountId),
        account,
      ]),
  );

  return accounts.map((account) => {
    const id = normalizeNetSuiteAccountId(account.accountId);
    const orgAccount = grantedByAccountId.get(id);
    if (!orgAccount) {
      return account;
    }
    return {
      ...account,
      label: orgNetSuiteMcpAccountLabel(orgAccount),
    };
  });
}

export async function isOrgNetSuiteMcpManaged(orgId: string): Promise<boolean> {
  if (!isOrgInstallMode()) {
    return false;
  }
  const enabled = await listEnabledOrgNetSuiteMcpAccounts(orgId);
  return enabled.length > 0;
}

/** Add org MCP account to user settings when access is granted. */
export async function addGrantedNetSuiteMcpAccountToUserSettings(
  userId: string,
  netsuiteMcpAccountId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(orgNetSuiteMcpAccount)
    .where(eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId))
    .limit(1);

  if (!row?.enabled) {
    return;
  }

  const orgAccount = rowToNetSuiteMcpAccount(row);

  const settings = await getUserSettings({ userId });
  const accounts = resolveNetSuiteAccounts(settings ?? {});
  const accountId = normalizeNetSuiteAccountId(orgAccount.accountId);
  if (accounts.some((entry) => entry.accountId === accountId)) {
    return;
  }

  const nextAccounts = upsertAccountEntry(accounts, orgRowToEntry(orgAccount));
  const activeId = settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : accountId;

  await upsertUserSettings({
    userId,
    netsuiteAccounts: nextAccounts,
    netsuiteAccountId: activeId,
    netsuiteClientId:
      nextAccounts.find((entry) => entry.accountId === activeId)?.clientId ??
      settings?.netsuiteClientId ??
      null,
  });
}

export async function removeNetSuiteMcpAccountFromUserSettings(
  userId: string,
  netsuiteMcpAccountId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(orgNetSuiteMcpAccount)
    .where(eq(orgNetSuiteMcpAccount.id, netsuiteMcpAccountId))
    .limit(1);

  if (!row) {
    return;
  }

  const settings = await getUserSettings({ userId });
  if (!settings) {
    return;
  }

  const accountId = normalizeNetSuiteAccountId(row.accountId);
  const accounts = resolveNetSuiteAccounts(settings);
  const nextAccounts = accounts.filter(
    (entry) => entry.accountId !== accountId,
  );

  if (nextAccounts.length === accounts.length) {
    return;
  }

  const normalizedActive = settings.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : null;
  const nextActive =
    normalizedActive === accountId
      ? (nextAccounts[0]?.accountId ?? null)
      : settings.netsuiteAccountId;

  const nextActiveNormalized = nextActive
    ? normalizeNetSuiteAccountId(nextActive)
    : null;

  await upsertUserSettings({
    userId,
    netsuiteAccounts: nextAccounts,
    netsuiteAccountId: nextActive,
    netsuiteClientId: nextActiveNormalized
      ? (nextAccounts.find((entry) => entry.accountId === nextActiveNormalized)
          ?.clientId ?? null)
      : null,
  });
}
