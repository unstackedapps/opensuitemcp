import { NetsuitePanel } from "@/components/admin/netsuite-panel";
import { getAdminActor } from "@/lib/org/admin/actor";
import { listAdminOrgOidcAccounts } from "@/lib/org/admin/oidc-accounts";

export default async function AdminNetSuiteOidcPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  const accounts = await listAdminOrgOidcAccounts(actor.orgId);

  return <NetsuitePanel accounts={accounts} />;
}
