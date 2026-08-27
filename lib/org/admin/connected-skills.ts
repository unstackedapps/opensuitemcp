import "server-only";

import type { ConnectedSkillSource } from "@/lib/ai/skills/catalog";
import { ChatSDKError } from "@/lib/errors";
import { writeOrgAuditLog } from "@/lib/org/audit";
import {
  connectOrgConnectedSkillSource,
  disconnectOrgConnectedSkillSource,
  listOrgConnectedSkillSourceRows,
  type OrgConnectedSkillSourceRow,
  refreshOrgConnectedSkillSource,
  setOrgConnectedSkillSourceEnabled,
} from "@/lib/org/connected-skills";

export async function listAdminOrgConnectedSkillSources(
  orgId: string,
): Promise<OrgConnectedSkillSourceRow[]> {
  return listOrgConnectedSkillSourceRows(orgId);
}

export async function connectAdminOrgConnectedSkillSource({
  orgId,
  actorUserId,
  url,
}: {
  orgId: string;
  actorUserId: string;
  url: string;
}): Promise<ConnectedSkillSource> {
  try {
    const source = await connectOrgConnectedSkillSource({ orgId, url });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "connected_skill.connect",
      targetType: "connected_skill_source",
      targetId: source.id,
      metadata: { label: source.label },
    });

    return source;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect skills.";
    throw new ChatSDKError("bad_request:api", message);
  }
}

export async function refreshAdminOrgConnectedSkillSource({
  orgId,
  actorUserId,
  sourceId,
}: {
  orgId: string;
  actorUserId: string;
  sourceId: string;
}): Promise<ConnectedSkillSource> {
  try {
    const source = await refreshOrgConnectedSkillSource({ orgId, sourceId });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "connected_skill.refresh",
      targetType: "connected_skill_source",
      targetId: sourceId,
    });

    return source;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to refresh skills.";
    throw new ChatSDKError("bad_request:api", message);
  }
}

export async function disconnectAdminOrgConnectedSkillSource({
  orgId,
  actorUserId,
  sourceId,
}: {
  orgId: string;
  actorUserId: string;
  sourceId: string;
}): Promise<void> {
  await disconnectOrgConnectedSkillSource({ orgId, sourceId });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "connected_skill.disconnect",
    targetType: "connected_skill_source",
    targetId: sourceId,
  });
}

export async function setAdminOrgConnectedSkillSourceEnabled({
  orgId,
  actorUserId,
  sourceId,
  enabled,
}: {
  orgId: string;
  actorUserId: string;
  sourceId: string;
  enabled: boolean;
}): Promise<void> {
  await setOrgConnectedSkillSourceEnabled({ orgId, sourceId, enabled });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: enabled ? "connected_skill.enable" : "connected_skill.disable",
    targetType: "connected_skill_source",
    targetId: sourceId,
  });
}
