import "server-only";

import {
  deleteOidcConnectionLinkForAccount,
  listOidcConnectionLinksForUser,
} from "@/lib/auth/user-oidc-connection-links";
import { getNetSuiteLoginRedirectUri } from "@/lib/netsuite/oauth/redirect-uris";
import {
  getNetSuiteAccountIdFromEnv,
  getNetSuiteOidcClientIdFromEnv,
  isSoloInstallMode,
} from "@/lib/org/install-config";
import {
  deleteOrgOidcAccount,
  grantUserOidcAccess,
  listOrgOidcAccounts,
  setOrgOidcAccountEnabled,
  updateOrgOidcAccount,
  upsertOrgOidcAccount,
} from "@/lib/org/oidc-accounts";
import { ensureDefaultOrg } from "@/lib/org/queries";
import type {
  SoloOidcLoginAccount,
  SoloOidcLoginSettings,
} from "@/lib/org/solo-oidc-login-types";

export type {
  SoloOidcLoginAccount,
  SoloOidcLoginSettings,
} from "@/lib/org/solo-oidc-login-types";

function getSoloOidcSetupHint(): string {
  const envAccountId = getNetSuiteAccountIdFromEnv()?.trim();
  const envClientId = getNetSuiteOidcClientIdFromEnv()?.trim();
  if (envAccountId && envClientId) {
    return "NetSuite OIDC was configured during install. Saving below overrides install env for sign-in.";
  }
  return "Create a NetSuite OIDC Provider integration (Authorization Code Grant + Public Client) with redirect URI /api/auth/netsuite/callback. Leave integration scopes and TBA types unchecked.";
}

function previewClientId(clientId: string | null): string | null {
  const trimmed = clientId?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…`;
}

function assertSoloInstallMode(): void {
  if (!isSoloInstallMode()) {
    throw new Error("NetSuite OIDC settings are only available in solo mode.");
  }
}

export async function getSoloOidcLoginSettings(
  userId?: string,
): Promise<SoloOidcLoginSettings> {
  assertSoloInstallMode();

  const defaultOrg = await ensureDefaultOrg();
  const rows = await listOrgOidcAccounts(defaultOrg.id);
  const connectionLinks = userId
    ? await listOidcConnectionLinksForUser(userId)
    : [];
  const linkByAccountId = new Map(
    connectionLinks.map((link) => [link.orgOidcAccountId, link]),
  );
  const envAccountId = getNetSuiteAccountIdFromEnv()?.trim() ?? null;
  const envClientId = getNetSuiteOidcClientIdFromEnv()?.trim() ?? null;

  const accounts: SoloOidcLoginAccount[] = rows.map((row) => {
    const link = linkByAccountId.get(row.id);
    return {
      id: row.id,
      accountId: row.accountId,
      name: row.name,
      clientIdPreview: previewClientId(row.oauthClientId),
      enabled: row.enabled,
      linkedLoginEmail: link?.email ?? null,
      verifiedAt: link?.verifiedAt?.toISOString() ?? null,
    };
  });

  let source: SoloOidcLoginSettings["source"] = "none";
  if (accounts.length > 0) {
    source = "db";
  } else if (envAccountId && envClientId) {
    source = "env";
  }

  return {
    redirectUri: getNetSuiteLoginRedirectUri(),
    setupHint: getSoloOidcSetupHint(),
    source,
    envAccountId: source === "env" ? envAccountId : null,
    accounts,
  };
}

/** Persist OIDC login config before an unauthenticated NetSuite authorize. */
export async function saveSoloOidcLoginConfig({
  accountId,
  clientId,
  name,
}: {
  accountId: string;
  clientId: string;
  name?: string;
}): Promise<{ accountId: string }> {
  assertSoloInstallMode();

  const defaultOrg = await ensureDefaultOrg();
  const row = await upsertOrgOidcAccount({
    orgId: defaultOrg.id,
    accountId,
    clientId,
    name,
  });

  return { accountId: row.accountId };
}

export async function updateSoloOidcLogin({
  userId,
  oidcAccountId,
  name,
  clientId,
}: {
  userId: string;
  oidcAccountId: string;
  name: string;
  clientId?: string | null;
}): Promise<SoloOidcLoginAccount> {
  assertSoloInstallMode();

  const defaultOrg = await ensureDefaultOrg();
  const row = await updateOrgOidcAccount({
    orgId: defaultOrg.id,
    oidcAccountId,
    name,
    clientId,
  });

  await grantUserOidcAccess({
    userId,
    orgOidcAccountId: row.id,
  });

  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    clientIdPreview: previewClientId(row.oauthClientId),
    enabled: row.enabled,
    linkedLoginEmail: null,
    verifiedAt: null,
  };
}

export async function upsertSoloOidcLogin({
  userId,
  accountId,
  clientId,
  name,
}: {
  userId: string;
  accountId: string;
  clientId: string;
  name?: string;
}): Promise<SoloOidcLoginAccount> {
  assertSoloInstallMode();

  const defaultOrg = await ensureDefaultOrg();
  const row = await upsertOrgOidcAccount({
    orgId: defaultOrg.id,
    accountId,
    clientId,
    name,
  });

  await grantUserOidcAccess({
    userId,
    orgOidcAccountId: row.id,
  });

  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    clientIdPreview: previewClientId(row.oauthClientId),
    enabled: row.enabled,
    linkedLoginEmail: null,
    verifiedAt: null,
  };
}

export async function setSoloOidcLoginEnabled({
  oidcAccountId,
  enabled,
}: {
  oidcAccountId: string;
  enabled: boolean;
}): Promise<void> {
  assertSoloInstallMode();

  const defaultOrg = await ensureDefaultOrg();
  await setOrgOidcAccountEnabled({
    orgId: defaultOrg.id,
    oidcAccountId,
    enabled,
  });
}

export async function removeSoloOidcLogin({
  oidcAccountId,
}: {
  oidcAccountId: string;
}): Promise<void> {
  assertSoloInstallMode();

  const defaultOrg = await ensureDefaultOrg();
  await deleteOidcConnectionLinkForAccount({ orgOidcAccountId: oidcAccountId });
  await deleteOrgOidcAccount({
    orgId: defaultOrg.id,
    oidcAccountId,
  });
}
