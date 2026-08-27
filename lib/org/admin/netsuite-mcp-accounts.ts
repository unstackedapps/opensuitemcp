import "server-only";

import { ChatSDKError } from "@/lib/errors";
import { writeOrgAuditLog } from "@/lib/org/audit";
import {
  deleteOrgNetSuiteMcpAccount,
  grantUserNetSuiteMcpAccess,
  listOrgNetSuiteMcpAccounts,
  type OrgNetSuiteMcpAccountRow,
  setOrgNetSuiteMcpAccountEnabled,
  setUserNetSuiteMcpAccess,
  updateOrgNetSuiteMcpAccountName,
  upsertOrgNetSuiteMcpAccount,
} from "@/lib/org/netsuite-mcp-accounts";

export type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";

export async function listAdminOrgNetSuiteMcpAccounts(
  orgId: string,
): Promise<OrgNetSuiteMcpAccountRow[]> {
  return listOrgNetSuiteMcpAccounts(orgId);
}

export async function createAdminOrgNetSuiteMcpAccount({
  orgId,
  actorUserId,
  accountId,
  name,
}: {
  orgId: string;
  actorUserId: string;
  accountId: string;
  name?: string;
}): Promise<OrgNetSuiteMcpAccountRow> {
  try {
    const created = await upsertOrgNetSuiteMcpAccount({
      orgId,
      accountId,
      name,
    });

    await grantUserNetSuiteMcpAccess({
      userId: actorUserId,
      netsuiteMcpAccountId: created.id,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "netsuite_mcp_account.create",
      targetType: "netsuite_mcp_account",
      targetId: created.id,
      metadata: { accountId: created.accountId, name: created.name },
    });

    return created;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create MCP account.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function updateAdminOrgNetSuiteMcpAccountName({
  orgId,
  actorUserId,
  netsuiteMcpAccountId,
  name,
}: {
  orgId: string;
  actorUserId: string;
  netsuiteMcpAccountId: string;
  name: string;
}): Promise<OrgNetSuiteMcpAccountRow> {
  try {
    const updated = await updateOrgNetSuiteMcpAccountName({
      orgId,
      netsuiteMcpAccountId,
      name,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "netsuite_mcp_account.update_name",
      targetType: "netsuite_mcp_account",
      targetId: netsuiteMcpAccountId,
      metadata: { name: updated.name },
    });

    return updated;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update MCP account.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function setAdminOrgNetSuiteMcpAccountEnabled({
  orgId,
  actorUserId,
  netsuiteMcpAccountId,
  enabled,
}: {
  orgId: string;
  actorUserId: string;
  netsuiteMcpAccountId: string;
  enabled: boolean;
}): Promise<void> {
  await setOrgNetSuiteMcpAccountEnabled({
    orgId,
    netsuiteMcpAccountId,
    enabled,
  });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: enabled
      ? "netsuite_mcp_account.enable"
      : "netsuite_mcp_account.disable",
    targetType: "netsuite_mcp_account",
    targetId: netsuiteMcpAccountId,
  });
}

export async function deleteAdminOrgNetSuiteMcpAccount({
  orgId,
  actorUserId,
  netsuiteMcpAccountId,
}: {
  orgId: string;
  actorUserId: string;
  netsuiteMcpAccountId: string;
}): Promise<void> {
  await deleteOrgNetSuiteMcpAccount({ orgId, netsuiteMcpAccountId });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "netsuite_mcp_account.delete",
    targetType: "netsuite_mcp_account",
    targetId: netsuiteMcpAccountId,
  });
}

export async function setAdminUserNetSuiteMcpAccess({
  orgId,
  actorUserId,
  userId,
  netsuiteMcpAccountIds,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
  netsuiteMcpAccountIds: string[];
}): Promise<void> {
  await setUserNetSuiteMcpAccess({ userId, netsuiteMcpAccountIds });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.netsuite_mcp_access",
    targetType: "user",
    targetId: userId,
    metadata: { netsuiteMcpAccountIds },
  });
}
