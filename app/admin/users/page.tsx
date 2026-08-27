import { auth } from "@/app/(auth)/auth";
import { UsersPanel } from "@/components/admin/users-panel";
import { listAdminOrgLlmProviders } from "@/lib/org/admin/llm-providers";
import { listAdminOrgNetSuiteMcpAccounts } from "@/lib/org/admin/netsuite-mcp-accounts";
import { listAdminOrgOidcAccounts } from "@/lib/org/admin/oidc-accounts";
import { listAdminOrgPersonas } from "@/lib/org/admin/personas";
import { listOrgUserTags } from "@/lib/org/admin/user-tags";
import { listOrgUsers } from "@/lib/org/admin/users";
import { requireOrgAdminSession } from "@/lib/org/setup";

export default async function AdminUsersPage() {
  const session = await auth();
  const admin = await requireOrgAdminSession(session);
  const users = await listOrgUsers(admin.orgId);
  const oidcAccounts = await listAdminOrgOidcAccounts(admin.orgId);
  const netsuiteMcpAccounts = await listAdminOrgNetSuiteMcpAccounts(
    admin.orgId,
  );
  const orgPersonas = await listAdminOrgPersonas(admin.orgId);
  const orgTags = await listOrgUserTags(admin.orgId);
  const llmProviders = await listAdminOrgLlmProviders(admin.orgId);

  return (
    <UsersPanel
      actorId={admin.userId}
      actorRole={admin.role}
      llmProviders={llmProviders}
      netsuiteMcpAccounts={netsuiteMcpAccounts}
      oidcAccounts={oidcAccounts}
      orgPersonas={orgPersonas}
      orgTags={orgTags}
      users={users}
    />
  );
}
