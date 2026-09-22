import { AgentAccessPanel } from "@/components/admin/agent-access-panel";
import { getAdminActor } from "@/lib/org/admin/actor";
import { getAdminAgentAccess } from "@/lib/org/admin/agent-access";
import { listOrgUsers } from "@/lib/org/admin/users";

export default async function AdminAgentAccessPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  const [state, users] = await Promise.all([
    getAdminAgentAccess(actor.orgId),
    listOrgUsers(actor.orgId),
  ]);

  return (
    <AgentAccessPanel
      state={state}
      users={users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }))}
    />
  );
}
