import "server-only";

import type { Session } from "next-auth";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";
import {
  ensureSeededProviderConfig,
  isProviderEntryConfigured,
  parseAiProviderConfig,
} from "@/lib/ai/provider-entries";
import { getUserSettings } from "@/lib/db/queries";
import { listConnectedNetSuiteAccountIds } from "@/lib/netsuite/tokens";
import { listAdminOrgLlmProviders } from "@/lib/org/admin/llm-providers";
import { listAdminOrgNetSuiteMcpAccounts } from "@/lib/org/admin/netsuite-mcp-accounts";
import { listAdminOrgOidcAccounts } from "@/lib/org/admin/oidc-accounts";
import { listAdminOrgPersonas } from "@/lib/org/admin/personas";
import { listAdminOrgSearchResources } from "@/lib/org/admin/search-resources";
import { listAdminOrgSkills } from "@/lib/org/admin/skills";
import { listOrgUsers } from "@/lib/org/admin/users";
import { hasEnvOidcLoginConfig } from "@/lib/org/bootstrap-config";
import { listOrgConnectedSkillSources } from "@/lib/org/connected-skills";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { listUserLlmProviderAccessIds } from "@/lib/org/llm-providers";
import { listLoginOidcOptions } from "@/lib/org/oidc-accounts";
import { getUserOrgContext } from "@/lib/org/queries";
import { sessionIsOrgAdmin } from "@/lib/org/session";
import {
  type OnboardingChecklistItem,
  type OnboardingMode,
  type OnboardingReadiness,
  type OnboardingStepId,
  type OnboardingStepStatus,
  ORG_STEP_ORDER,
  SOLO_STEP_ORDER,
} from "./types";
import { getOnboardingViewedSteps } from "./viewed-steps";

function stepMeta(
  id: OnboardingStepId,
  mode: OnboardingMode,
): Pick<
  OnboardingStepStatus,
  "label" | "description" | "required" | "optional"
> {
  switch (id) {
    case "welcome":
      return {
        label: "Welcome",
        description: "Overview of setup steps",
        required: false,
      };
    case "oidc":
      return {
        label: "OIDC Login",
        description:
          mode === "org"
            ? "Add more NetSuite OIDC sign-in integrations"
            : "Set up NetSuite sign-in or continue with email",
        required: false,
        optional: true,
      };
    case "mcp":
      return {
        label: "NetSuite MCP",
        description:
          "Connect one or more NetSuite MCP connections for chat tools",
        required: true,
      };
    case "oidc-extra":
      return {
        label: "OIDC Login",
        description:
          mode === "solo"
            ? "Set up NetSuite OIDC sign-in or continue with email"
            : "Add additional NetSuite OIDC integrations (optional)",
        required: false,
        optional: true,
      };
    case "llm":
      return {
        label: "LLM provider",
        description: "Add at least one AI provider with an API key",
        required: true,
      };
    case "persona":
      return {
        label: "Default persona",
        description: "Choose a specialist for new chats",
        required: false,
        optional: true,
      };
    case "connected-skills":
      return {
        label: "Connected skills",
        description: "Link a public GitHub skills pack",
        required: false,
        optional: true,
      };
    case "custom-skills":
      return {
        label: "Custom skills",
        description: "Add your own SKILL.md instructions",
        required: false,
        optional: true,
      };
    case "search":
      return {
        label: "Web search",
        description: "Add trusted domains for grounded answers",
        required: false,
        optional: true,
      };
    case "timezone":
      return {
        label: "Timezone",
        description: "Set your local timezone for timestamps",
        required: false,
        optional: true,
      };
    case "users":
      return {
        label: "Team members",
        description: "Invite users or import from CSV",
        required: false,
        optional: true,
      };
    case "gates":
      return {
        label: "Org policies",
        description: "Review what users can configure on their own",
        required: false,
        optional: true,
      };
    case "checklist":
      return {
        label: "Finish setup",
        description: "Review your progress and open the app",
        required: false,
      };
    default:
      return {
        label: id,
        description: "",
        required: false,
      };
  }
}

async function getSoloReadiness(userId: string): Promise<{
  oidcComplete: boolean;
  mcpComplete: boolean;
  llmComplete: boolean;
  personaComplete: boolean;
  connectedSkillsComplete: boolean;
  customSkillsComplete: boolean;
  searchComplete: boolean;
  timezoneComplete: boolean;
  oidcAccountCount: number;
  connectedMcpCount: number;
}> {
  const [settings, connectedIds, oidcOptions] = await Promise.all([
    getUserSettings({ userId }),
    listConnectedNetSuiteAccountIds(userId),
    listLoginOidcOptions(),
  ]);

  const aiProviders = ensureSeededProviderConfig(
    parseAiProviderConfig(settings?.aiProviders),
  );
  const llmComplete = aiProviders.providers.some(isProviderEntryConfigured);
  const mcpComplete = connectedIds.length > 0;
  const oidcAccountCount = oidcOptions.length;
  const oidcComplete = hasEnvOidcLoginConfig() || oidcAccountCount > 0;

  return {
    oidcComplete,
    mcpComplete,
    llmComplete,
    personaComplete: Boolean(
      settings?.defaultPersonaId?.trim() || AVA_PERSONA_ID,
    ),
    connectedSkillsComplete: (settings?.connectedSkillSources?.length ?? 0) > 0,
    customSkillsComplete: (settings?.customSkills?.length ?? 0) > 0,
    searchComplete: (settings?.searchResources?.length ?? 0) > 0,
    timezoneComplete: Boolean(
      settings?.timezone && settings.timezone !== "UTC",
    ),
    oidcAccountCount,
    connectedMcpCount: connectedIds.length,
  };
}

async function getOrgReadiness(
  orgId: string,
  userId: string,
): Promise<{
  oidcComplete: boolean;
  mcpComplete: boolean;
  llmComplete: boolean;
  usersComplete: boolean;
  oidcAccountCount: number;
  connectedMcpCount: number;
  userCount: number;
  checklist: OnboardingChecklistItem[];
}> {
  const [
    oidcAccounts,
    mcpAccounts,
    providers,
    users,
    skills,
    personas,
    searchResources,
    connectedSources,
    grantedProviderIds,
    connectedIds,
  ] = await Promise.all([
    listAdminOrgOidcAccounts(orgId),
    listAdminOrgNetSuiteMcpAccounts(orgId),
    listAdminOrgLlmProviders(orgId),
    listOrgUsers(orgId),
    listAdminOrgSkills(orgId),
    listAdminOrgPersonas(orgId),
    listAdminOrgSearchResources(orgId),
    listOrgConnectedSkillSources(orgId),
    listUserLlmProviderAccessIds(userId),
    listConnectedNetSuiteAccountIds(userId),
  ]);

  const enabledOidc = oidcAccounts.filter((account) => account.enabled);
  const oidcComplete = hasEnvOidcLoginConfig() || enabledOidc.length > 0;
  const connectedMcpAccounts = mcpAccounts.filter(
    (account) =>
      account.enabled &&
      (account.integrationStatus === "connected" ||
        account.integrationStatus === "ready"),
  );
  const mcpComplete =
    connectedMcpAccounts.length > 0 && connectedIds.length > 0;
  const enabledProviders = providers.filter(
    (provider) => provider.enabled && provider.hasOrgApiKey,
  );
  const llmComplete =
    enabledProviders.length > 0 &&
    enabledProviders.some((provider) =>
      grantedProviderIds.includes(provider.id),
    );
  const usersComplete = users.length > 1;

  const checklist: OnboardingChecklistItem[] = [
    {
      id: "connected-skills",
      label: "Connected skills",
      description: "Add a GitHub skills pack for the org",
      complete: connectedSources.length > 0,
    },
    {
      id: "skills-enabled",
      label: "Oracle or community skills",
      description: "Enable shared skill packs for your team",
      complete: skills.some((skill) => skill.enabled),
    },
    {
      id: "personas",
      label: "Personas",
      description: "Enable specialist personas for users",
      complete: personas.some((persona) => persona.enabled),
    },
    {
      id: "web-search",
      label: "Web search resources",
      description: "Curate trusted search domains",
      complete: searchResources.some((resource) => resource.enabled),
    },
    {
      id: "invite-team",
      label: "Invite teammates",
      description:
        users.length > 1
          ? `${users.length} users in your org`
          : "Add more users when you are ready — a solo org is fine to finish",
      complete: usersComplete,
      optional: true,
    },
  ];

  return {
    oidcComplete,
    mcpComplete,
    llmComplete,
    usersComplete,
    oidcAccountCount: enabledOidc.length,
    connectedMcpCount: connectedIds.length,
    userCount: users.length,
    checklist,
  };
}

function buildSteps(
  mode: OnboardingMode,
  flags: {
    oidcComplete: boolean;
    mcpComplete: boolean;
    llmComplete: boolean;
    usersComplete?: boolean;
    personaComplete?: boolean;
    connectedSkillsComplete?: boolean;
    customSkillsComplete?: boolean;
    searchComplete?: boolean;
    timezoneComplete?: boolean;
  },
  viewedSteps: OnboardingStepId[],
): OnboardingStepStatus[] {
  const order = mode === "org" ? ORG_STEP_ORDER : SOLO_STEP_ORDER;
  const viewed = new Set(viewedSteps);

  return order.map((id) => {
    const meta = stepMeta(id, mode);
    let complete = false;

    switch (id) {
      case "welcome":
        complete = true;
        break;
      case "oidc":
        complete = flags.oidcComplete;
        break;
      case "mcp":
        complete = flags.mcpComplete;
        break;
      case "oidc-extra":
        complete = flags.oidcComplete;
        break;
      case "llm":
        complete = flags.llmComplete;
        break;
      case "persona":
        complete = Boolean(flags.personaComplete);
        break;
      case "connected-skills":
        complete = Boolean(flags.connectedSkillsComplete);
        break;
      case "custom-skills":
        complete = Boolean(flags.customSkillsComplete);
        break;
      case "search":
        complete = Boolean(flags.searchComplete);
        break;
      case "timezone":
        complete = Boolean(flags.timezoneComplete);
        break;
      case "users":
        complete = Boolean(flags.usersComplete);
        break;
      case "gates":
        complete = false;
        break;
      case "checklist":
        complete = false;
        break;
      default:
        complete = false;
    }

    return {
      id,
      ...meta,
      complete,
      viewed: viewed.has(id),
    };
  });
}

function buildSoloChecklist(
  steps: OnboardingStepStatus[],
): OnboardingChecklistItem[] {
  return steps
    .filter((step) => step.id !== "welcome" && step.id !== "checklist")
    .map((step) => ({
      id: step.id,
      label: step.label,
      description: step.description,
      complete: step.complete,
      optional: step.optional,
    }));
}

export async function getOnboardingReadiness(
  session: Session,
): Promise<OnboardingReadiness | null> {
  if (!session.user?.id) {
    return null;
  }

  const mode: OnboardingMode = isOrgInstallMode() ? "org" : "solo";

  if (mode === "org") {
    if (!sessionIsOrgAdmin(session) || !session.user.orgId) {
      return null;
    }

    const flags = await getOrgReadiness(session.user.orgId, session.user.id);
    const viewedSteps = await getOnboardingViewedSteps(session.user.id);
    const steps = buildSteps(mode, flags, viewedSteps);
    const requiredComplete = steps
      .filter((step) => step.required)
      .every((step) => step.complete);

    return {
      mode,
      completed: false,
      steps,
      checklist: flags.checklist,
      canComplete: requiredComplete,
      envOidcConfigured: hasEnvOidcLoginConfig(),
    };
  }

  const flags = await getSoloReadiness(session.user.id);
  const viewedSteps = await getOnboardingViewedSteps(session.user.id);
  const steps = buildSteps(mode, flags, viewedSteps);
  const requiredComplete = steps
    .filter((step) => step.required)
    .every((step) => step.complete);

  return {
    mode,
    completed: false,
    steps,
    checklist: buildSoloChecklist(steps),
    canComplete: requiredComplete,
    envOidcConfigured: hasEnvOidcLoginConfig(),
  };
}

export async function canAccessOnboarding(
  session: Session | null,
): Promise<boolean> {
  if (!session?.user?.id) {
    return false;
  }

  if (isOrgInstallMode()) {
    return sessionIsOrgAdmin(session);
  }

  const orgContext = await getUserOrgContext(session.user.id);
  return !orgContext;
}
