import { Suspense } from "react";
import { NetSuiteMcpPanel } from "@/components/admin/netsuite-mcp-panel";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { listConnectedNetSuiteAccountIds } from "@/lib/netsuite/tokens";
import { getAdminActor } from "@/lib/org/admin/actor";
import { listAdminOrgNetSuiteMcpAccounts } from "@/lib/org/admin/netsuite-mcp-accounts";

export default async function AdminNetSuiteMcpPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  const accounts = await listAdminOrgNetSuiteMcpAccounts(actor.orgId);
  const connectedIds = await listConnectedNetSuiteAccountIds(actor.userId);

  return (
    <Suspense fallback={null}>
      <NetSuiteMcpPanel
        accounts={accounts}
        actorConnectedAccountIds={connectedIds.map((id) =>
          normalizeNetSuiteAccountId(id),
        )}
      />
    </Suspense>
  );
}
