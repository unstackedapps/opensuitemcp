import { SearchPanel } from "@/components/admin/search-panel";
import { getAdminActor } from "@/lib/org/admin/actor";
import { listAdminOrgSearchResources } from "@/lib/org/admin/search-resources";

export default async function AdminSearchPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  const resources = await listAdminOrgSearchResources(actor.orgId);

  return <SearchPanel resources={resources} />;
}
