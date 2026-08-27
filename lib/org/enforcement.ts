import "server-only";

import {
  AVA_PERSONA_ID,
  isBuiltinPersonaId,
  isPersonaBuilderId,
  listPersonasForClient,
} from "@/lib/ai/personas/catalog";
import type { CustomPersona, PersonaSource } from "@/lib/ai/personas/types";
import type { AiProviderConfig } from "@/lib/ai/provider-entries";
import {
  type ResolvedUserChatProvider,
  resolveUserChatProvider,
} from "@/lib/ai/resolve-user-chat-provider";
import type { CatalogSkill, CustomSkill } from "@/lib/ai/skills/catalog";
import {
  listCommunityCatalogSkills,
  listOracleCatalogSkills,
} from "@/lib/ai/skills/catalog";
import type { ConnectedSkillSource } from "@/lib/ai/skills/sync-connected";
import type { UserSettings } from "@/lib/db/schema";
import type { NetSuiteAccountEntry } from "@/lib/netsuite/accounts";
import { listEnabledOrgConnectedSkillSources } from "@/lib/org/connected-skills";
import {
  listEnabledOrgCustomSkills,
  mergeOrgCustomSkillsForUser,
  orgCustomSkillToClientSkill,
  overlayOrgUserCustomSkills,
} from "@/lib/org/custom-skills";
import { isOrgInstallMode } from "@/lib/org/install-config";
import {
  getOrgLlmProviderApiKey,
  getOrgLlmProviderById,
  listEnabledOrgLlmProvidersForUser,
  userHasLlmProviderAccess,
} from "@/lib/org/llm-providers";
import { assertOrgLlmDefaultOnlyPatch } from "@/lib/org/llm-user-sync";
import {
  clampUserMcpToolPatch,
  getOrgMcpDisabledToolNames,
} from "@/lib/org/mcp-tool-policy";
import { assertUserNetSuiteMcpAccountAllowed } from "@/lib/org/netsuite-mcp-accounts";
import {
  isOrgNetSuiteMcpManaged,
  syncUserNetSuiteMcpAccountsWithOrg,
  validateOrgNetSuiteMcpAccountsPatch,
} from "@/lib/org/netsuite-mcp-user-sync";
import {
  getOrgPersonaByRef,
  getOrgPersonaPolicy,
  isPersonaAllowedByOrgPolicy,
  listOrgPersonas,
  listUserPersonaAccessIds,
  userHasPersonaAccess,
} from "@/lib/org/personas";
import {
  applyOrgSkillPolicyToSettings,
  enabledCatalogSkillIdsFromOrgPolicy,
  getOrgSkillCatalogForDisplay,
  getOrgSkillPolicy,
  mergeOrgEnabledCatalogSkillIds,
  overlayUserCatalogSkillIds,
} from "@/lib/org/skills";

export async function resolveOrgAwareChatProvider(params: {
  orgId: string | null | undefined;
  userId: string;
  chatAiProviderId?: string | null;
  settings: UserSettings | null;
}): Promise<ResolvedUserChatProvider> {
  const resolved = resolveUserChatProvider({
    chatAiProviderId: params.chatAiProviderId,
    settings: params.settings,
  });

  if (!isOrgInstallMode() || !params.orgId) {
    return resolved;
  }

  if (resolved.dangling || resolved.missing) {
    return resolved;
  }

  const entryId = resolved.entry?.id;
  if (!entryId) {
    return resolved;
  }

  const orgRow = await getOrgLlmProviderById({
    orgId: params.orgId,
    providerId: entryId,
  });

  if (!orgRow || !orgRow.enabled) {
    return {
      dangling: false,
      missing: true,
      type: null,
      apiKey: null,
      maxIterations: resolved.maxIterations,
      entry: null,
      label: null,
    };
  }

  const hasAccess = await userHasLlmProviderAccess({
    userId: params.userId,
    providerId: entryId,
  });
  if (!hasAccess) {
    return {
      dangling: false,
      missing: true,
      type: null,
      apiKey: null,
      maxIterations: resolved.maxIterations,
      entry: null,
      label: null,
    };
  }

  let apiKey = resolved.apiKey;
  let maxIterations = resolved.maxIterations;

  const modeConfig = orgRow.modeConfig ?? {};
  if (modeConfig.maxIterations) {
    const parsed = Number.parseInt(modeConfig.maxIterations, 10);
    if (Number.isFinite(parsed)) {
      maxIterations = Math.max(1, Math.min(20, parsed));
    }
  }

  const orgKey = await getOrgLlmProviderApiKey({
    orgId: params.orgId,
    providerId: entryId,
  });
  if (orgKey) {
    apiKey = orgKey;
  }

  return {
    ...resolved,
    apiKey,
    maxIterations,
  };
}

export async function validateOrgProviderSettingsPatch({
  orgId,
  userId,
  incoming,
}: {
  orgId: string;
  userId: string;
  existing: AiProviderConfig;
  incoming: AiProviderConfig;
  legacyKeys: {
    googleApiKey?: string | null;
    anthropicApiKey?: string | null;
    openaiApiKey?: string | null;
  };
}): Promise<AiProviderConfig> {
  if (!isOrgInstallMode()) {
    return incoming;
  }

  const orgRows = await listEnabledOrgLlmProvidersForUser({ orgId, userId });
  const { buildOrgLlmProviderConfig } = await import("@/lib/org/llm-user-sync");
  const orgConfig = buildOrgLlmProviderConfig(orgRows, incoming.defaultId);

  return assertOrgLlmDefaultOnlyPatch({ orgConfig, incoming });
}

export async function applyOrgSkillEnforcement({
  orgId,
  enabledSkillIds,
}: {
  orgId: string;
  enabledSkillIds: string[];
}): Promise<string[]> {
  if (!isOrgInstallMode()) {
    return enabledSkillIds;
  }

  const policy = await getOrgSkillPolicy(orgId);
  const catalog = [
    ...listOracleCatalogSkills(),
    ...listCommunityCatalogSkills(),
  ];

  return applyOrgSkillPolicyToSettings({
    enabledSkillIds,
    policy,
    catalog,
  });
}

export async function getOrgFilteredSkillCatalog(
  orgId: string,
): Promise<CatalogSkill[]> {
  return getOrgSkillCatalogForDisplay(orgId);
}

export function filterUserEnabledOrgConnectedSources(
  sources: ConnectedSkillSource[],
  disabledSourceIds: string[],
): ConnectedSkillSource[] {
  if (disabledSourceIds.length === 0) {
    return sources;
  }
  const disabled = new Set(disabledSourceIds);
  return sources.filter((source) => !disabled.has(source.id));
}

export function normalizeDisabledOrgConnectedSkillSourceIds(
  raw: unknown,
): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

export async function buildOrgAwareSkillSettings({
  orgId,
  enabledSkillIds,
  customSkills,
  connectedSkillSources,
  disabledOrgConnectedSkillSourceIds,
}: {
  orgId: string;
  enabledSkillIds: string[];
  customSkills: CustomSkill[];
  connectedSkillSources: ConnectedSkillSource[];
  disabledOrgConnectedSkillSourceIds?: string[];
}): Promise<{
  enabledSkillIds: string[];
  customSkills: CustomSkill[];
  connectedSkillSources: ConnectedSkillSource[];
}> {
  if (!isOrgInstallMode()) {
    return {
      enabledSkillIds,
      customSkills,
      connectedSkillSources,
    };
  }

  const policy = await getOrgSkillPolicy(orgId);
  const catalog = [
    ...listOracleCatalogSkills(),
    ...listCommunityCatalogSkills(),
  ];
  const orgEnabled = enabledCatalogSkillIdsFromOrgPolicy(policy, catalog);
  const alwaysOnIds = catalog
    .filter((skill) => skill.alwaysOn)
    .map((skill) => skill.id);
  const orgCustom = await listEnabledOrgCustomSkills(orgId);
  const orgConnected = await listEnabledOrgConnectedSkillSources(orgId);
  const disabledIds = normalizeDisabledOrgConnectedSkillSourceIds(
    disabledOrgConnectedSkillSourceIds,
  );

  return {
    enabledSkillIds: mergeOrgEnabledCatalogSkillIds({
      orgEnabledIds: orgEnabled,
      userEnabledIds: enabledSkillIds,
      alwaysOnIds,
    }),
    customSkills: mergeOrgCustomSkillsForUser({
      orgSkills: orgCustom.map(orgCustomSkillToClientSkill),
      userSkills: customSkills,
    }),
    connectedSkillSources: filterUserEnabledOrgConnectedSources(
      orgConnected,
      disabledIds,
    ),
  };
}

export async function validateOrgSkillSettingsPatch({
  orgId,
  nextEnabledSkillIds,
  nextCustomSkills,
  nextConnectedSources,
  nextDisabledOrgConnectedSkillSourceIds,
}: {
  orgId: string;
  nextEnabledSkillIds?: string[];
  nextCustomSkills?: CustomSkill[];
  nextConnectedSources?: ConnectedSkillSource[];
  nextDisabledOrgConnectedSkillSourceIds?: string[];
}): Promise<{
  enabledSkillIds?: string[];
  customSkills?: CustomSkill[];
  disabledOrgConnectedSkillSourceIds?: string[];
}> {
  if (!isOrgInstallMode()) {
    return {
      enabledSkillIds: nextEnabledSkillIds,
      customSkills: nextCustomSkills,
      disabledOrgConnectedSkillSourceIds:
        nextDisabledOrgConnectedSkillSourceIds,
    };
  }

  const policy = await getOrgSkillPolicy(orgId);
  const catalog = [
    ...listOracleCatalogSkills(),
    ...listCommunityCatalogSkills(),
  ];
  const orgEnabled = enabledCatalogSkillIdsFromOrgPolicy(policy, catalog);
  const alwaysOnIds = catalog
    .filter((skill) => skill.alwaysOn)
    .map((skill) => skill.id);

  let enabledSkillIds = nextEnabledSkillIds;
  if (nextEnabledSkillIds !== undefined) {
    enabledSkillIds = overlayUserCatalogSkillIds({
      orgEnabledIds: orgEnabled,
      incomingIds: nextEnabledSkillIds,
      alwaysOnIds,
    });
  }

  if (nextConnectedSources !== undefined) {
    const expectedConnected = await listEnabledOrgConnectedSkillSources(orgId);
    if (
      JSON.stringify(nextConnectedSources) !== JSON.stringify(expectedConnected)
    ) {
      throw new Error(
        "Connected skill packs are managed by your organization administrator.",
      );
    }
  }

  let customSkills = nextCustomSkills;
  if (nextCustomSkills !== undefined) {
    const orgCustom = await listEnabledOrgCustomSkills(orgId);
    customSkills = overlayOrgUserCustomSkills({
      orgSkills: orgCustom.map(orgCustomSkillToClientSkill),
      incoming: nextCustomSkills,
    });
  }

  let disabledOrgConnectedSkillSourceIds =
    nextDisabledOrgConnectedSkillSourceIds;
  if (nextDisabledOrgConnectedSkillSourceIds !== undefined) {
    const orgConnected = await listEnabledOrgConnectedSkillSources(orgId);
    const allowedIds = new Set(orgConnected.map((source) => source.id));
    disabledOrgConnectedSkillSourceIds =
      normalizeDisabledOrgConnectedSkillSourceIds(
        nextDisabledOrgConnectedSkillSourceIds,
      ).filter((id) => allowedIds.has(id));
  }

  return { enabledSkillIds, customSkills, disabledOrgConnectedSkillSourceIds };
}

export async function filterUserNetSuiteAccountsForOrg({
  orgId,
  userId,
  accounts,
}: {
  orgId: string;
  userId: string;
  accounts: NetSuiteAccountEntry[];
}): Promise<NetSuiteAccountEntry[]> {
  const sync = await syncUserNetSuiteMcpAccountsWithOrg({
    orgId,
    userId,
    userAccounts: accounts,
  });
  return sync.accounts;
}

export async function validateOrgNetSuiteAccountsPatch({
  orgId,
  userId,
  accounts,
}: {
  orgId: string;
  userId: string;
  accounts: NetSuiteAccountEntry[];
}): Promise<void> {
  await validateOrgNetSuiteMcpAccountsPatch({
    orgId,
    userId,
    nextAccounts: accounts,
  });
}

export async function assertOrgNetSuiteMcpConnectAllowed({
  orgId,
  userId,
  accountId,
}: {
  orgId: string;
  userId: string;
  accountId: string;
}): Promise<void> {
  if (!isOrgInstallMode()) {
    return;
  }

  if (!(await isOrgNetSuiteMcpManaged(orgId))) {
    return;
  }

  await assertUserNetSuiteMcpAccountAllowed({ userId, orgId, accountId });
}

export function assertOrgPersonalConnectedSkillsAllowed(
  orgId: string | null | undefined,
): void {
  if (isOrgInstallMode() && orgId) {
    throw new Error(
      "Connected skill packs cannot be changed in organization mode.",
    );
  }
}

export async function assertOrgPersonaAllowed({
  orgId,
  userId,
  personaId,
}: {
  orgId: string;
  userId: string;
  personaId: string | null | undefined;
}): Promise<void> {
  if (!isOrgInstallMode()) {
    return;
  }

  const id = personaId?.trim();
  if (!id) {
    return;
  }

  if (!isBuiltinPersonaId(id) || isPersonaBuilderId(id)) {
    return;
  }

  const policy = await getOrgPersonaPolicy(orgId);
  if (!isPersonaAllowedByOrgPolicy(id, policy)) {
    throw new Error(`Persona "${id}" is not enabled for your organization.`);
  }

  if (id === AVA_PERSONA_ID) {
    return;
  }

  const orgPersonaRow = await getOrgPersonaByRef(orgId, id);
  if (!orgPersonaRow) {
    throw new Error(`Persona "${id}" is not enabled for your organization.`);
  }

  const hasAccess = await userHasPersonaAccess({
    userId,
    orgPersonaId: orgPersonaRow.id,
  });
  if (!hasAccess) {
    throw new Error(
      "You do not have access to this persona. Contact an administrator.",
    );
  }
}

export async function buildOrgAwarePersonaList(
  orgId: string,
  userId: string,
  customPersonas: CustomPersona[],
): Promise<
  Array<{
    id: string;
    name: string;
    shortName: string;
    primaryRole: string;
    source: PersonaSource;
  }>
> {
  const personas = listPersonasForClient(customPersonas);
  if (!isOrgInstallMode()) {
    return personas;
  }

  const policy = await getOrgPersonaPolicy(orgId);
  const orgRows = await listOrgPersonas(orgId);
  const refToOrgPersonaId = new Map(
    orgRows.map((row) => [row.personaRef, row.id]),
  );
  const grantIds = new Set(await listUserPersonaAccessIds(userId));

  return personas.filter((persona) => {
    if (persona.source === "custom") {
      return true;
    }
    if (!isPersonaAllowedByOrgPolicy(persona.id, policy)) {
      return false;
    }
    if (persona.id === AVA_PERSONA_ID) {
      return true;
    }
    const orgPersonaId = refToOrgPersonaId.get(persona.id);
    if (!orgPersonaId) {
      return false;
    }
    return grantIds.has(orgPersonaId);
  });
}

export async function validateOrgMcpToolSettingsPatch({
  orgId,
  accountId,
  incomingDisabledNames,
}: {
  orgId: string;
  accountId: string;
  incomingDisabledNames: string[];
}): Promise<string[]> {
  const orgDisabled = await getOrgMcpDisabledToolNames({ orgId, accountId });
  return clampUserMcpToolPatch({
    orgDisabledNames: orgDisabled,
    accountId,
    incomingDisabledNames,
  });
}
