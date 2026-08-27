import "server-only";

import { writeOrgAuditLog } from "@/lib/org/audit";
import { listOrgSkillsForAdmin, setOrgSkillEnabled } from "@/lib/org/skills";

export type AdminOrgSkillRow = Awaited<
  ReturnType<typeof listOrgSkillsForAdmin>
>[number];

export async function listAdminOrgSkills(
  orgId: string,
): Promise<AdminOrgSkillRow[]> {
  return listOrgSkillsForAdmin(orgId);
}

export async function setAdminOrgSkillEnabled({
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
  await setOrgSkillEnabled({ orgId, skillId, enabled });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: enabled ? "skill.enable" : "skill.disable",
    targetType: "skill",
    targetId: skillId,
  });
}

export type { OrgSkillRow } from "@/lib/org/skills";
