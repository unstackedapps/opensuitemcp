"use client";

import { UsersPanel } from "@/components/admin/users-panel";
import type { OrgRole } from "@/lib/db/schema";
import type { AdminOrgPersonaRow } from "@/lib/org/admin/personas";
import type { OrgUserTagRow } from "@/lib/org/admin/user-tags";
import type { OrgUserRow } from "@/lib/org/admin/users";
import type { OrgLlmProviderRow } from "@/lib/org/llm-providers";
import type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";
import type { OrgOidcAccountRow } from "@/lib/org/oidc-accounts";

type OnboardingUsersStepProps = {
  actorId: string;
  actorRole: OrgRole;
  users: OrgUserRow[];
  oidcAccounts: OrgOidcAccountRow[];
  netsuiteMcpAccounts: OrgNetSuiteMcpAccountRow[];
  orgPersonas: AdminOrgPersonaRow[];
  orgTags: OrgUserTagRow[];
  llmProviders: OrgLlmProviderRow[];
};

export function OnboardingUsersStep({
  actorId,
  actorRole,
  users,
  oidcAccounts,
  netsuiteMcpAccounts,
  orgPersonas,
  orgTags,
  llmProviders,
}: OnboardingUsersStepProps) {
  return (
    <UsersPanel
      actorId={actorId}
      actorRole={actorRole}
      embedded={{
        title: "Team members",
        description:
          "Add teammates manually or import a CSV (up to 5,000 rows). Assign OIDC, MCP, persona, and provider access per user or in bulk.",
      }}
      llmProviders={llmProviders}
      netsuiteMcpAccounts={netsuiteMcpAccounts}
      oidcAccounts={oidcAccounts}
      orgPersonas={orgPersonas}
      orgTags={orgTags}
      users={users}
    />
  );
}
