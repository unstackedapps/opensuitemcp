import "server-only";

import { cookies } from "next/headers";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { sanitizeReturnTo } from "@/lib/http/public-origin";
import {
  getNetSuiteIntegrationChecklist,
  getNetSuiteNewIntegrationUrl,
  getNetSuiteRedirectUri,
  NETSUITE_DCR_CLIENT_NAME,
  normalizeNetSuiteAccountId,
  resolveNetSuiteAccounts,
  upsertAccountEntry,
} from "@/lib/netsuite/accounts";
import { registerNetSuiteDcrClient } from "@/lib/netsuite/dcr";
import {
  buildAuthorizationUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "@/lib/netsuite/oauth";
import { writeOrgAuditLog } from "@/lib/org/audit";
import {
  getOrgNetSuiteMcpAccountById,
  setOrgNetSuiteMcpIntegrationStatus,
} from "@/lib/org/netsuite-mcp-accounts";
import { addGrantedNetSuiteMcpAccountToUserSettings } from "@/lib/org/netsuite-mcp-user-sync";

export type AdminNetSuiteMcpProbeResult =
  | {
      status: "ready";
      clientId: string;
    }
  | {
      status: "needs_integration";
      accountId: string;
      integrationUrl: string;
      redirectUri: string;
      dcrClientName: string;
      checklist: string[];
    }
  | {
      status: "error";
      error: string;
    };

export async function probeAdminOrgNetSuiteMcpAccount({
  orgId,
  actorUserId,
  netsuiteMcpAccountId,
}: {
  orgId: string;
  actorUserId: string;
  netsuiteMcpAccountId: string;
}): Promise<AdminNetSuiteMcpProbeResult> {
  const account = await getOrgNetSuiteMcpAccountById({
    orgId,
    netsuiteMcpAccountId,
  });
  if (!account) {
    throw new ChatSDKError("bad_request:database", "MCP account not found.");
  }

  const accountId = normalizeNetSuiteAccountId(account.accountId);
  const dcr = await registerNetSuiteDcrClient(accountId);

  if (dcr.status === "ready") {
    await setOrgNetSuiteMcpIntegrationStatus({
      orgId,
      netsuiteMcpAccountId,
      status: "ready",
      oauthClientId: dcr.clientId,
      error: null,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "netsuite_mcp_account.probe_ready",
      targetType: "netsuite_mcp_account",
      targetId: netsuiteMcpAccountId,
      metadata: { accountId },
    });

    return { status: "ready", clientId: dcr.clientId };
  }

  if (dcr.status === "needs_integration") {
    await setOrgNetSuiteMcpIntegrationStatus({
      orgId,
      netsuiteMcpAccountId,
      status: "needs_integration",
      error: dcr.error,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "netsuite_mcp_account.probe_needs_integration",
      targetType: "netsuite_mcp_account",
      targetId: netsuiteMcpAccountId,
      metadata: { accountId },
    });

    return {
      status: "needs_integration",
      accountId,
      integrationUrl: getNetSuiteNewIntegrationUrl(accountId),
      redirectUri: getNetSuiteRedirectUri(),
      dcrClientName: NETSUITE_DCR_CLIENT_NAME,
      checklist: getNetSuiteIntegrationChecklist(getNetSuiteRedirectUri()),
    };
  }

  await setOrgNetSuiteMcpIntegrationStatus({
    orgId,
    netsuiteMcpAccountId,
    status: "error",
    error: dcr.error,
  });

  return { status: "error", error: dcr.error };
}

export async function startAdminOrgNetSuiteMcpTestConnect({
  orgId,
  actorUserId,
  netsuiteMcpAccountId,
  returnPath = "/admin/netsuite/mcp",
}: {
  orgId: string;
  actorUserId: string;
  netsuiteMcpAccountId: string;
  returnPath?: string;
}): Promise<{ authorizeUrl: string }> {
  const account = await getOrgNetSuiteMcpAccountById({
    orgId,
    netsuiteMcpAccountId,
  });
  if (!account) {
    throw new ChatSDKError("bad_request:database", "MCP account not found.");
  }

  if (
    account.integrationStatus !== "ready" &&
    account.integrationStatus !== "connected"
  ) {
    throw new ChatSDKError(
      "bad_request:api",
      "Run integration check first. The NetSuite Integration record must be ready before OAuth.",
    );
  }

  const accountId = normalizeNetSuiteAccountId(account.accountId);
  await addGrantedNetSuiteMcpAccountToUserSettings(
    actorUserId,
    netsuiteMcpAccountId,
  );

  const settings = await getUserSettings({ userId: actorUserId });
  let accounts = resolveNetSuiteAccounts(settings ?? {});
  const existing = accounts.find((item) => item.accountId === accountId);
  const clientId =
    account.oauthClientId?.trim() || existing?.clientId?.trim() || null;

  if (!clientId) {
    throw new ChatSDKError(
      "bad_request:api",
      "No OAuth client ID resolved. Run integration check first.",
    );
  }

  accounts = upsertAccountEntry(accounts, {
    accountId,
    label: account.name,
    clientId,
  });

  await upsertUserSettings({
    userId: actorUserId,
    netsuiteAccountId: accountId,
    netsuiteClientId: clientId,
    netsuiteAccounts: accounts,
  });

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600,
  };
  cookieStore.set("netsuite_code_verifier", codeVerifier, cookieOptions);
  cookieStore.set("netsuite_state", state, cookieOptions);
  cookieStore.set("netsuite_user_id", actorUserId, cookieOptions);
  cookieStore.set("netsuite_account_id", accountId, cookieOptions);
  cookieStore.set(
    "netsuite_return_path",
    sanitizeReturnTo(returnPath, "/admin/netsuite/mcp"),
    cookieOptions,
  );

  const authUrl = await buildAuthorizationUrl({
    userId: actorUserId,
    accountId,
    codeChallenge,
    state,
  });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "netsuite_mcp_account.test_connect_start",
    targetType: "netsuite_mcp_account",
    targetId: netsuiteMcpAccountId,
    metadata: { accountId },
  });

  return { authorizeUrl: authUrl };
}

export async function markOrgNetSuiteMcpAccountConnectedFromOAuth({
  orgId,
  accountId,
  actorUserId,
}: {
  orgId: string;
  accountId: string;
  actorUserId: string;
}): Promise<void> {
  const normalized = normalizeNetSuiteAccountId(accountId);
  const { getOrgNetSuiteMcpAccountByAccountId } = await import(
    "@/lib/org/netsuite-mcp-accounts"
  );
  const row = await getOrgNetSuiteMcpAccountByAccountId(orgId, normalized);
  if (!row) {
    return;
  }

  await setOrgNetSuiteMcpIntegrationStatus({
    orgId,
    netsuiteMcpAccountId: row.id,
    status: "connected",
    error: null,
  });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "netsuite_mcp_account.test_connect_success",
    targetType: "netsuite_mcp_account",
    targetId: row.id,
    metadata: { accountId: normalized },
  });
}
