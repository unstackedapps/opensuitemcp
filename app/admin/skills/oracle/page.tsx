import { SkillsPanel } from "@/components/admin/skills-panel";
import { getAdminActor } from "@/lib/org/admin/actor";
import { listAdminOrgSkills } from "@/lib/org/admin/skills";

export default async function AdminOracleSkillsPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  const skills = await listAdminOrgSkills(actor.orgId);

  return <SkillsPanel section="oracle" skills={skills} />;
}
