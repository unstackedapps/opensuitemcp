export const NETSUITE_DCR_CLIENT_NAME = "OpenSuiteMCP";

export type NetSuiteAccountEntry = {
  accountId: string;
  label: string;
  clientId?: string | null;
};

export function normalizeNetSuiteAccountId(accountId: string): string {
  return accountId.trim().toLowerCase().replace(/_/g, "-");
}

/** Nickname (accountId), or just the id when no nickname is set. */
export function formatNetSuiteAccountDisplay(account: {
  accountId: string;
  label?: string | null;
}): string {
  const accountId = normalizeNetSuiteAccountId(account.accountId);
  const nickname = account.label?.trim();
  if (!nickname || nickname.toLowerCase() === accountId) {
    return accountId;
  }
  return `${nickname} (${accountId})`;
}

/** Prefer an explicit request (settings UI) over the saved active account. */
export function resolveRequestedNetSuiteAccountId(params: {
  requested?: string | null;
  activeAccountId?: string | null;
}): string | null {
  const requested = params.requested?.trim();
  if (requested) {
    return normalizeNetSuiteAccountId(requested);
  }
  const active = params.activeAccountId?.trim();
  if (active) {
    return normalizeNetSuiteAccountId(active);
  }
  return null;
}

export function isNetSuiteAccountConnected(
  accountId: string | null | undefined,
  status:
    | {
        connected?: boolean;
        connectedAccountIds?: string[] | null;
      }
    | null
    | undefined,
): boolean {
  if (!accountId?.trim()) {
    return false;
  }
  const normalized = normalizeNetSuiteAccountId(accountId);
  if (Array.isArray(status?.connectedAccountIds)) {
    return status.connectedAccountIds.some(
      (id) => normalizeNetSuiteAccountId(id) === normalized,
    );
  }
  return Boolean(status?.connected);
}

/**
 * Whether a stored token row belongs to the account being disconnected.
 * Matches normalized account ids (case / underscore variants) and treats
 * legacy rows with a missing accountId as belonging to the active account.
 */
export function tokenBelongsToAccount(
  tokenAccountId: string | null | undefined,
  targetAccountId: string,
  activeAccountId?: string | null,
): boolean {
  const target = normalizeNetSuiteAccountId(targetAccountId);
  if (!tokenAccountId?.trim()) {
    if (!activeAccountId?.trim()) {
      return false;
    }
    return normalizeNetSuiteAccountId(activeAccountId) === target;
  }
  return normalizeNetSuiteAccountId(tokenAccountId) === target;
}

export function getNetSuiteRedirectUri(): string {
  const base =
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/netsuite/callback`;
}

/**
 * Deep link to NetSuite's blank New Integration form.
 * Query-param prefills do not work: the form is server-rendered POST-only,
 * uses CSRF, and DCR fields stay disabled until Public Client is checked.
 */
export function getNetSuiteNewIntegrationUrl(accountId: string): string {
  const normalized = normalizeNetSuiteAccountId(accountId);
  return `https://${normalized}.app.netsuite.com/app/common/integration/integrapp.nl`;
}

export { getNetSuiteIntegrationChecklist } from "@/lib/netsuite/integration-checklist";

export function getNetSuiteAuthorizeHost(accountId: string): string {
  return `https://${normalizeNetSuiteAccountId(accountId)}.app.netsuite.com`;
}

export function getNetSuiteApiHost(accountId: string): string {
  return `https://${normalizeNetSuiteAccountId(accountId)}.suitetalk.api.netsuite.com`;
}

/** Coerce stored JSON + legacy singular fields into a stable account list. */
export function resolveNetSuiteAccounts(settings: {
  netsuiteAccounts?: NetSuiteAccountEntry[] | null;
  netsuiteAccountId?: string | null;
  netsuiteClientId?: string | null;
}): NetSuiteAccountEntry[] {
  const fromJson = Array.isArray(settings.netsuiteAccounts)
    ? settings.netsuiteAccounts
        .filter((entry) => entry?.accountId?.trim())
        .map((entry) => ({
          accountId: normalizeNetSuiteAccountId(entry.accountId),
          label:
            entry.label?.trim() || normalizeNetSuiteAccountId(entry.accountId),
          clientId: entry.clientId?.trim() || null,
        }))
    : [];

  if (fromJson.length > 0) {
    return dedupeAccounts(fromJson);
  }

  if (settings.netsuiteAccountId?.trim()) {
    const accountId = normalizeNetSuiteAccountId(settings.netsuiteAccountId);
    return [
      {
        accountId,
        label: accountId,
        clientId: settings.netsuiteClientId?.trim() || null,
      },
    ];
  }

  return [];
}

export function dedupeAccounts(
  accounts: NetSuiteAccountEntry[],
): NetSuiteAccountEntry[] {
  const byId = new Map<string, NetSuiteAccountEntry>();
  for (const account of accounts) {
    const accountId = normalizeNetSuiteAccountId(account.accountId);
    const previous = byId.get(accountId);
    byId.set(accountId, {
      accountId,
      label: account.label?.trim() || previous?.label || accountId,
      clientId: account.clientId?.trim() || previous?.clientId || null,
    });
  }
  return Array.from(byId.values());
}

export function upsertAccountEntry(
  accounts: NetSuiteAccountEntry[],
  entry: NetSuiteAccountEntry,
): NetSuiteAccountEntry[] {
  const accountId = normalizeNetSuiteAccountId(entry.accountId);
  const next = accounts.filter((item) => item.accountId !== accountId);
  next.push({
    accountId,
    label: entry.label?.trim() || accountId,
    clientId:
      entry.clientId === undefined
        ? (accounts.find((item) => item.accountId === accountId)?.clientId ??
          null)
        : entry.clientId?.trim() || null,
  });
  return next.sort((a, b) => a.label.localeCompare(b.label));
}

export function removeAccountEntry(
  accounts: NetSuiteAccountEntry[],
  accountId: string,
): NetSuiteAccountEntry[] {
  const normalized = normalizeNetSuiteAccountId(accountId);
  return accounts.filter((item) => item.accountId !== normalized);
}
