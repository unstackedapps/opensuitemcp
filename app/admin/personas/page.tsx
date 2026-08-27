import { PersonasPanel } from "@/components/admin/personas-panel";
import { getAdminActor } from "@/lib/org/admin/actor";
import { listAdminOrgPersonas } from "@/lib/org/admin/personas";

export default async function AdminPersonasPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  const personas = await listAdminOrgPersonas(actor.orgId);

  return <PersonasPanel personas={personas} />;
}
