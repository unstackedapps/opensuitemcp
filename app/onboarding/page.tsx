import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { OnboardingWizardLoader } from "@/components/onboarding/onboarding-wizard-loader";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { listConnectedNetSuiteAccountIds } from "@/lib/netsuite/tokens";
import {
  getOnboardingPageData,
  redirectIfOnboardingComplete,
} from "@/lib/onboarding/guards";
import { canAccessOnboarding } from "@/lib/onboarding/readiness";
import { getAdminActor } from "@/lib/org/admin/actor";
import { listAdminOrgConnectedSkillSources } from "@/lib/org/admin/connected-skills";
import { listAdminOrgLlmProviders } from "@/lib/org/admin/llm-providers";
import { listAdminOrgNetSuiteMcpAccounts } from "@/lib/org/admin/netsuite-mcp-accounts";
import { listAdminOrgOidcAccounts } from "@/lib/org/admin/oidc-accounts";
import { listAdminOrgPersonas } from "@/lib/org/admin/personas";
import { listAdminOrgSearchResources } from "@/lib/org/admin/search-resources";
import { listAdminOrgSkills } from "@/lib/org/admin/skills";
import { listOrgUserTags } from "@/lib/org/admin/user-tags";
import { listOrgUsers } from "@/lib/org/admin/users";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!(await canAccessOnboarding(session))) {
    redirect("/");
  }

  await redirectIfOnboardingComplete();

  const readiness = await getOnboardingPageData(session);
  if (!readiness) {
    redirect("/");
  }

  if (readiness.mode === "org") {
    const actor = await getAdminActor();
    if (!actor) {
      redirect("/");
    }

    const [
      oidcAccounts,
      mcpAccounts,
      providers,
      users,
      orgTags,
      skills,
      personas,
      searchResources,
      connectedSkillSources,
      connectedIds,
    ] = await Promise.all([
      listAdminOrgOidcAccounts(actor.orgId),
      listAdminOrgNetSuiteMcpAccounts(actor.orgId),
      listAdminOrgLlmProviders(actor.orgId),
      listOrgUsers(actor.orgId),
      listOrgUserTags(actor.orgId),
      listAdminOrgSkills(actor.orgId),
      listAdminOrgPersonas(actor.orgId),
      listAdminOrgSearchResources(actor.orgId),
      listAdminOrgConnectedSkillSources(actor.orgId),
      listConnectedNetSuiteAccountIds(actor.userId),
    ]);

    return (
      <Suspense fallback={null}>
        <OnboardingWizardLoader
          actorId={actor.userId}
          actorRole={actor.role}
          connectedMcpAccountIds={connectedIds.map((id) =>
            normalizeNetSuiteAccountId(id),
          )}
          initialReadiness={readiness}
          llmProviders={providers}
          mcpAccounts={mcpAccounts}
          oidcAccounts={oidcAccounts}
          orgPersonas={personas}
          orgTags={orgTags}
          orgSkills={skills}
          connectedSkillSources={connectedSkillSources}
          searchResources={searchResources}
          users={users}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <OnboardingWizardLoader initialReadiness={readiness} />
    </Suspense>
  );
}
