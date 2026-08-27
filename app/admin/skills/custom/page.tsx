import { SkillsPanel } from "@/components/admin/skills-panel";
import { getAdminActor } from "@/lib/org/admin/actor";
import { listAdminOrgCustomSkills } from "@/lib/org/admin/custom-skills";

export default async function AdminCustomSkillsPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  const customSkills = await listAdminOrgCustomSkills(actor.orgId);

  return <SkillsPanel customSkills={customSkills} section="custom" />;
}
