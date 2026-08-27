import "server-only";

import {
  type AiProviderConfig,
  type AiProviderEntry,
  defaultLabelForProviderType,
  isHostedAiProviderType,
  isProviderEntryConfigured,
  resolveDefaultProviderId,
} from "@/lib/ai/provider-entries";
import { isOrgInstallMode } from "@/lib/org/install-config";
import {
  listEnabledOrgLlmProvidersForUser,
  type OrgLlmProviderRow,
} from "@/lib/org/llm-providers";

/** Placeholder so configured org providers appear usable in the settings UI (no real key). */
const ORG_MANAGED_KEY_PLACEHOLDER = "org-managed";

export type OrgLlmUserPolicy = {
  managedByOrg: boolean;
};

const PERSONAL_POLICY: OrgLlmUserPolicy = {
  managedByOrg: false,
};

function orgRowToClientEntry(row: OrgLlmProviderRow): AiProviderEntry {
  const type = isHostedAiProviderType(row.provider) ? row.provider : "custom";
  const label =
    row.modeConfig.label?.trim() || defaultLabelForProviderType(type);

  return {
    id: row.id,
    label,
    type,
    apiKey: row.hasOrgApiKey ? ORG_MANAGED_KEY_PLACEHOLDER : null,
    maxIterations: row.modeConfig.maxIterations?.trim() || "10",
    baseUrl: row.modeConfig.baseUrl?.trim() || undefined,
    speedModelId: row.modeConfig.speedModelId?.trim() || undefined,
    reasoningModelId: row.modeConfig.reasoningModelId?.trim() || undefined,
  };
}

export function buildOrgLlmProviderConfig(
  orgRows: OrgLlmProviderRow[],
  preferredDefaultId?: string | null,
): AiProviderConfig {
  const providers = orgRows.map(orgRowToClientEntry);
  const defaultId = resolveDefaultProviderId(
    { defaultId: preferredDefaultId ?? null, providers },
    preferredDefaultId,
  );

  return { defaultId, providers };
}

export function isOrgLlmManaged(): boolean {
  return isOrgInstallMode();
}

export async function syncUserLlmProvidersWithOrg({
  orgId,
  userId,
  userConfig,
}: {
  orgId: string;
  userId: string;
  userConfig: AiProviderConfig;
}): Promise<{
  config: AiProviderConfig;
  policy: OrgLlmUserPolicy;
  configChanged: boolean;
}> {
  if (!isOrgInstallMode()) {
    return {
      config: userConfig,
      policy: PERSONAL_POLICY,
      configChanged: false,
    };
  }

  const orgRows = await listEnabledOrgLlmProvidersForUser({
    orgId,
    userId,
  });
  const config = buildOrgLlmProviderConfig(orgRows, userConfig.defaultId);

  const configChanged =
    userConfig.defaultId !== config.defaultId ||
    userConfig.providers.length !== config.providers.length ||
    userConfig.providers.some((entry, index) => {
      const synced = config.providers[index];
      return (
        !synced ||
        entry.id !== synced.id ||
        entry.type !== synced.type ||
        entry.label !== synced.label
      );
    });

  return {
    config,
    policy: { managedByOrg: true },
    configChanged,
  };
}

export function assertOrgLlmDefaultOnlyPatch({
  orgConfig,
  incoming,
}: {
  orgConfig: AiProviderConfig;
  incoming: AiProviderConfig;
}): AiProviderConfig {
  if (incoming.providers.length !== orgConfig.providers.length) {
    throw new Error(
      "LLM providers are managed by your organization administrator.",
    );
  }

  for (const entry of incoming.providers) {
    const orgEntry = orgConfig.providers.find((row) => row.id === entry.id);
    if (!orgEntry) {
      throw new Error(
        "LLM providers are managed by your organization administrator.",
      );
    }

    if (
      entry.type !== orgEntry.type ||
      entry.label !== orgEntry.label ||
      entry.apiKey !== orgEntry.apiKey ||
      entry.maxIterations !== orgEntry.maxIterations ||
      entry.baseUrl !== orgEntry.baseUrl ||
      entry.speedModelId !== orgEntry.speedModelId ||
      entry.reasoningModelId !== orgEntry.reasoningModelId
    ) {
      throw new Error(
        "LLM providers are managed by your organization administrator.",
      );
    }
  }

  const defaultId = resolveDefaultProviderId(incoming);
  if (defaultId) {
    const defaultEntry = orgConfig.providers.find(
      (entry) => entry.id === defaultId,
    );
    if (!defaultEntry || !isProviderEntryConfigured(defaultEntry)) {
      throw new Error("Choose a configured organization LLM provider.");
    }
  }

  return {
    defaultId,
    providers: orgConfig.providers,
  };
}
