import "server-only";

import { ChatSDKError } from "@/lib/errors";
import { getOrgUserRole } from "@/lib/org/admin/users";
import { writeOrgAuditLog } from "@/lib/org/audit";
import type { OrgOidcAccountRow } from "@/lib/org/oidc-accounts";
import {
  deleteOrgOidcAccount,
  listOrgOidcAccounts,
  setOrgOidcAccountEnabled,
  setUserOidcAccess,
  updateOrgOidcAccount,
  upsertOrgOidcAccount,
} from "@/lib/org/oidc-accounts";

export type { OrgOidcAccountRow } from "@/lib/org/oidc-accounts";

export async function listAdminOrgOidcAccounts(
  orgId: string,
): Promise<OrgOidcAccountRow[]> {
  return listOrgOidcAccounts(orgId);
}

export async function createAdminOrgOidcAccount({
  orgId,
  actorUserId,
  accountId,
  clientId,
  name,
}: {
  orgId: string;
  actorUserId: string;
  accountId: string;
  clientId: string;
  name?: string;
}): Promise<OrgOidcAccountRow> {
  try {
    const created = await upsertOrgOidcAccount({
      orgId,
      accountId,
      clientId,
      name,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "oidc_account.create",
      targetType: "oidc_account",
      targetId: created.id,
      metadata: { accountId: created.accountId, name: created.name },
    });

    return created;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create OIDC account.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function updateAdminOrgOidcAccount({
  orgId,
  actorUserId,
  oidcAccountId,
  name,
  clientId,
}: {
  orgId: string;
  actorUserId: string;
  oidcAccountId: string;
  name: string;
  clientId?: string | null;
}): Promise<OrgOidcAccountRow> {
  try {
    const updated = await updateOrgOidcAccount({
      orgId,
      oidcAccountId,
      name,
      clientId,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "oidc_account.update",
      targetType: "oidc_account",
      targetId: oidcAccountId,
      metadata: { name: updated.name },
    });

    return updated;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update OIDC account.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function setAdminOrgOidcAccountEnabled({
  orgId,
  actorUserId,
  oidcAccountId,
  enabled,
}: {
  orgId: string;
  actorUserId: string;
  oidcAccountId: string;
  enabled: boolean;
}): Promise<void> {
  await setOrgOidcAccountEnabled({ orgId, oidcAccountId, enabled });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: enabled ? "oidc_account.enable" : "oidc_account.disable",
    targetType: "oidc_account",
    targetId: oidcAccountId,
  });
}

export async function deleteAdminOrgOidcAccount({
  orgId,
  actorUserId,
  oidcAccountId,
}: {
  orgId: string;
  actorUserId: string;
  oidcAccountId: string;
}): Promise<void> {
  await deleteOrgOidcAccount({ orgId, oidcAccountId });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "oidc_account.delete",
    targetType: "oidc_account",
    targetId: oidcAccountId,
  });
}

export async function setAdminUserOidcAccess({
  orgId,
  actorUserId,
  userId,
  orgOidcAccountIds,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
  orgOidcAccountIds: string[];
}): Promise<void> {
  const role = await getOrgUserRole(orgId, userId);
  if (!role) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  await setUserOidcAccess({ userId, orgOidcAccountIds });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.oidc_access_update",
    targetType: "user",
    targetId: userId,
    metadata: { orgOidcAccountIds },
  });
}
