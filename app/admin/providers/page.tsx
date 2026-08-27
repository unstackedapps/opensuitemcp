import { ProvidersPanel } from "@/components/admin/providers-panel";
import { getAdminActor } from "@/lib/org/admin/actor";
import { listAdminOrgLlmProviders } from "@/lib/org/admin/llm-providers";

export default async function AdminProvidersPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  const providers = await listAdminOrgLlmProviders(actor.orgId);

  return <ProvidersPanel providers={providers} />;
}
