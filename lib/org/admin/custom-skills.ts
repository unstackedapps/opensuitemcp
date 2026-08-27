import "server-only";

import { ChatSDKError } from "@/lib/errors";
import { writeOrgAuditLog } from "@/lib/org/audit";
import {
  createOrgCustomSkill,
  deleteOrgCustomSkill,
  listOrgCustomSkills,
  type OrgCustomSkillRow,
  setOrgCustomSkillEnabled,
  updateOrgCustomSkill,
} from "@/lib/org/custom-skills";

export type { OrgCustomSkillRow } from "@/lib/org/custom-skills";

export async function listAdminOrgCustomSkills(
  orgId: string,
): Promise<OrgCustomSkillRow[]> {
  return listOrgCustomSkills(orgId);
}

export async function createAdminOrgCustomSkill({
  orgId,
  actorUserId,
  name,
  content,
}: {
  orgId: string;
  actorUserId: string;
  name: string;
  content: string;
}): Promise<OrgCustomSkillRow> {
  try {
    const created = await createOrgCustomSkill({ orgId, name, content });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "org_custom_skill.create",
      targetType: "org_custom_skill",
      targetId: created.id,
      metadata: { name: created.name },
    });

    return created;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create custom skill.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function updateAdminOrgCustomSkill({
  orgId,
  actorUserId,
  skillId,
  name,
  content,
}: {
  orgId: string;
  actorUserId: string;
  skillId: string;
  name: string;
  content: string;
}): Promise<OrgCustomSkillRow> {
  try {
    const updated = await updateOrgCustomSkill({
      orgId,
      skillId,
      name,
      content,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "org_custom_skill.update",
      targetType: "org_custom_skill",
      targetId: skillId,
      metadata: { name: updated.name },
    });

    return updated;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update custom skill.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function setAdminOrgCustomSkillEnabled({
  orgId,
  actorUserId,
  skillId,
  enabled,
}: {
  orgId: string;
  actorUserId: string;
  skillId: string;
  enabled: boolean;
}): Promise<void> {
  await setOrgCustomSkillEnabled({ orgId, skillId, enabled });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: enabled ? "org_custom_skill.enable" : "org_custom_skill.disable",
    targetType: "org_custom_skill",
    targetId: skillId,
  });
}

export async function deleteAdminOrgCustomSkill({
  orgId,
  actorUserId,
  skillId,
}: {
  orgId: string;
  actorUserId: string;
  skillId: string;
}): Promise<void> {
  await deleteOrgCustomSkill({ orgId, skillId });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "org_custom_skill.delete",
    targetType: "org_custom_skill",
    targetId: skillId,
  });
}
