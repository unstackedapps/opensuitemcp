import "server-only";

import {
  listOrgAgentAccessUserIds,
  resolveMcpPolicy,
  setOrgAgentAccessUsers,
  upsertOrgMcpServerPolicy,
} from "@/lib/mcp/server/policy";
import { writeOrgAuditLog } from "@/lib/org/audit";

export type AdminAgentAccessState = {
  enabled: boolean;
  memberAccess: "all" | "selected";
  maxKeysPerUser: number;
  allowedUserIds: string[];
};

export async function getAdminAgentAccess(
  orgId: string,
): Promise<AdminAgentAccessState> {
  const [policy, allowedUserIds] = await Promise.all([
    resolveMcpPolicy(orgId),
    listOrgAgentAccessUserIds(orgId),
  ]);

  return {
    enabled: policy.enabled,
    memberAccess: policy.memberAccess,
    maxKeysPerUser: policy.maxKeysPerUser,
    allowedUserIds,
  };
}

export async function setAdminAgentAccessPolicy(params: {
  orgId: string;
  actorUserId: string;
  enabled?: boolean;
  memberAccess?: "all" | "selected";
  maxKeysPerUser?: number;
}): Promise<void> {
  await upsertOrgMcpServerPolicy({
    orgId: params.orgId,
    enabled: params.enabled,
    memberAccess: params.memberAccess,
    maxKeysPerUser: params.maxKeysPerUser,
  });

  await writeOrgAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    action: "org.agent_access_policy_update",
    targetType: "org",
    targetId: params.orgId,
    metadata: {
      enabled: params.enabled,
      memberAccess: params.memberAccess,
      maxKeysPerUser: params.maxKeysPerUser,
    },
  });
}

export async function setAdminAgentAccessMembers(params: {
  orgId: string;
  actorUserId: string;
  userIds: string[];
}): Promise<void> {
  await setOrgAgentAccessUsers({
    orgId: params.orgId,
    userIds: params.userIds,
  });

  await writeOrgAuditLog({
    orgId: params.orgId,
    actorUserId: params.actorUserId,
    action: "org.agent_access_members_update",
    targetType: "org",
    targetId: params.orgId,
    metadata: { count: params.userIds.length },
  });
}
