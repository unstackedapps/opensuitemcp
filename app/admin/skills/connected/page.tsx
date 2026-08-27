import { SkillsPanel } from "@/components/admin/skills-panel";
import { getAdminActor } from "@/lib/org/admin/actor";
import { listAdminOrgConnectedSkillSources } from "@/lib/org/admin/connected-skills";

export default async function AdminConnectedSkillsPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  const connectedSources = await listAdminOrgConnectedSkillSources(actor.orgId);

  return (
    <SkillsPanel connectedSources={connectedSources} section="connected" />
  );
}
