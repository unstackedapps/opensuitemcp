import "server-only";

import { ChatSDKError } from "@/lib/errors";
import { setAdminUserLlmProviderAccess } from "@/lib/org/admin/llm-providers";
import { setAdminUserNetSuiteMcpAccess } from "@/lib/org/admin/netsuite-mcp-accounts";
import { setAdminUserOidcAccess } from "@/lib/org/admin/oidc-accounts";
import { setAdminUserPersonaAccess } from "@/lib/org/admin/personas";
import { getOrgUserRole } from "@/lib/org/admin/users";
import { writeOrgAuditLog } from "@/lib/org/audit";

export async function bulkSetOrgUserAccess({
  orgId,
  actorUserId,
  userIds,
  oidcAccountIds,
  netsuiteMcpAccountIds,
  orgPersonaIds,
  providerIds,
}: {
  orgId: string;
  actorUserId: string;
  userIds: string[];
  oidcAccountIds?: string[];
  netsuiteMcpAccountIds?: string[];
  orgPersonaIds?: string[];
  providerIds?: string[];
}): Promise<{ updated: number; errors: string[] }> {
  const uniqueUserIds = [...new Set(userIds)];
  const errors: string[] = [];
  let updated = 0;

  for (const userId of uniqueUserIds) {
    const role = await getOrgUserRole(orgId, userId);
    if (!role) {
      errors.push(`User ${userId} is not in this organization.`);
      continue;
    }

    try {
      if (oidcAccountIds !== undefined) {
        await setAdminUserOidcAccess({
          orgId,
          actorUserId,
          userId,
          orgOidcAccountIds: oidcAccountIds,
        });
      }
      if (netsuiteMcpAccountIds !== undefined) {
        await setAdminUserNetSuiteMcpAccess({
          orgId,
          actorUserId,
          userId,
          netsuiteMcpAccountIds,
        });
      }
      if (orgPersonaIds !== undefined) {
        await setAdminUserPersonaAccess({
          orgId,
          actorUserId,
          userId,
          orgPersonaIds,
        });
      }
      if (providerIds !== undefined) {
        await setAdminUserLlmProviderAccess({
          orgId,
          actorUserId,
          userId,
          providerIds,
        });
      }
      updated += 1;
    } catch (error) {
      const message =
        error instanceof ChatSDKError
          ? typeof error.cause === "string"
            ? error.cause
            : error.message
          : error instanceof Error
            ? error.message
            : "Request failed.";
      errors.push(`${userId}: ${message}`);
    }
  }

  if (updated > 0) {
    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "user.bulk_access_update",
      targetType: "user",
      metadata: {
        userCount: updated,
        oidc: oidcAccountIds?.length ?? null,
        mcp: netsuiteMcpAccountIds?.length ?? null,
        personas: orgPersonaIds?.length ?? null,
        providers: providerIds?.length ?? null,
      },
    });
  }

  return { updated, errors };
}
