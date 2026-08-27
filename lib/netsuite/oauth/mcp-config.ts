import { getUserSettings } from "@/lib/db/queries";
import {
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
} from "@/lib/netsuite/accounts";
import { getNetSuiteMcpRedirectUri } from "./redirect-uris";

export type NetSuiteOAuthConfig = {
  NS_ACCOUNT_ID: string;
  NS_INTEGRATION_CLIENT_ID: string;
  NS_REDIRECT_URI: string;
};

export async function getMcpOAuthConfig(
  userId: string,
  accountId?: string | null,
): Promise<NetSuiteOAuthConfig | null> {
  const settings = await getUserSettings({ userId });
  const NS_REDIRECT_URI = getNetSuiteMcpRedirectUri();

  const activeAccountId = settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : null;
  const requestedAccountId = accountId?.trim()
    ? normalizeNetSuiteAccountId(accountId)
    : null;
  const resolvedAccountId = requestedAccountId || activeAccountId;

  if (!resolvedAccountId) {
    return null;
  }

  const accounts = resolveNetSuiteAccounts(settings ?? {});
  const resolvedAccount = accounts.find(
    (account) => account.accountId === resolvedAccountId,
  );
  let clientId = resolvedAccount?.clientId?.trim() || "";
  if (!clientId && resolvedAccountId === activeAccountId) {
    clientId = settings?.netsuiteClientId?.trim() || "";
  }

  if (!clientId) {
    return null;
  }

  return {
    NS_ACCOUNT_ID: resolvedAccountId,
    NS_INTEGRATION_CLIENT_ID: clientId,
    NS_REDIRECT_URI,
  };
}
