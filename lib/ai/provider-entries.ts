export type HostedAiProviderType = "google" | "anthropic" | "openai";
export type AiProviderType = HostedAiProviderType | "custom";

export type AiProviderEntry = {
  id: string;
  label: string;
  type: AiProviderType;
  apiKey: string | null;
  maxIterations: string;
  baseUrl?: string;
  speedModelId?: string;
  reasoningModelId?: string;
};

export type AiProviderConfig = {
  defaultId: string | null;
  providers: AiProviderEntry[];
};

export type CustomModelOption = {
  id: string;
  name?: string;
};

export function openaiCompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

export function openaiCompatibleModelsUrl(baseUrl: string): string {
  return `${openaiCompatibleBaseUrl(baseUrl)}/models`;
}

export const EMPTY_AI_PROVIDER_CONFIG: AiProviderConfig = {
  defaultId: null,
  providers: [],
};

export const MAX_AI_PROVIDERS = 10;
export const MAX_AI_PROVIDER_LABEL_LENGTH = 64;

const HOSTED_TYPES: HostedAiProviderType[] = ["google", "anthropic", "openai"];

export function isHostedAiProviderType(
  value: string,
): value is HostedAiProviderType {
  return HOSTED_TYPES.includes(value as HostedAiProviderType);
}

export function isAiProviderType(value: string): value is AiProviderType {
  return isHostedAiProviderType(value) || value === "custom";
}

export function isMultiAiProviders(
  config: AiProviderConfig | null | undefined,
): boolean {
  return (config?.providers.length ?? 0) > 0;
}

export function parseAiProviderConfig(value: unknown): AiProviderConfig {
  if (!value || typeof value !== "object") {
    return { defaultId: null, providers: [] };
  }
  const record = value as {
    defaultId?: unknown;
    providers?: unknown;
  };
  const providers = Array.isArray(record.providers)
    ? record.providers.flatMap((entry) => {
        const parsed = parseAiProviderEntry(entry);
        return parsed ? [parsed] : [];
      })
    : [];
  const defaultId =
    typeof record.defaultId === "string" && record.defaultId.trim()
      ? record.defaultId
      : null;
  return {
    defaultId:
      defaultId && providers.some((entry) => entry.id === defaultId)
        ? defaultId
        : (providers[0]?.id ?? null),
    providers,
  };
}

function parseAiProviderEntry(value: unknown): AiProviderEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<AiProviderEntry>;
  if (
    typeof record.id !== "string" ||
    !record.id.trim() ||
    typeof record.label !== "string" ||
    !record.label.trim() ||
    typeof record.type !== "string" ||
    !isAiProviderType(record.type)
  ) {
    return null;
  }
  return {
    id: record.id,
    label: record.label.trim(),
    type: record.type,
    apiKey: typeof record.apiKey === "string" ? record.apiKey : null,
    maxIterations: clampMaxIterations(record.maxIterations),
    baseUrl:
      typeof record.baseUrl === "string" ? record.baseUrl.trim() : undefined,
    speedModelId:
      typeof record.speedModelId === "string"
        ? record.speedModelId.trim()
        : undefined,
    reasoningModelId:
      typeof record.reasoningModelId === "string"
        ? record.reasoningModelId.trim()
        : undefined,
  };
}

export function clampMaxIterations(value: string | null | undefined): string {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) {
    return "10";
  }
  return Math.max(1, Math.min(20, parsed)).toString();
}

export function normalizeProviderLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function findDuplicateProviderLabel(
  providers: AiProviderEntry[],
): string | null {
  const seen = new Set<string>();
  for (const entry of providers) {
    const key = normalizeProviderLabel(entry.label);
    if (!key) {
      return entry.label;
    }
    if (seen.has(key)) {
      return entry.label;
    }
    seen.add(key);
  }
  return null;
}

export function findProviderById(
  config: AiProviderConfig,
  id: string | null | undefined,
): AiProviderEntry | undefined {
  if (!id) {
    return;
  }
  return config.providers.find((entry) => entry.id === id);
}

export type LegacyAiProviderSettings = {
  googleApiKey?: string | null;
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
  aiProvider?: string | null;
  maxIterations?: string | null;
};

export function migrateLegacyKeysToEntries(
  legacy: LegacyAiProviderSettings,
  generateId: () => string = () => crypto.randomUUID(),
): AiProviderConfig {
  const maxIterations = clampMaxIterations(legacy.maxIterations);
  const providers: AiProviderEntry[] = [];
  const hostedKeys: Array<{
    type: HostedAiProviderType;
    apiKey: string | null | undefined;
  }> = [
    { type: "google", apiKey: legacy.googleApiKey },
    { type: "anthropic", apiKey: legacy.anthropicApiKey },
    { type: "openai", apiKey: legacy.openaiApiKey },
  ];

  for (const hosted of hostedKeys) {
    const apiKey = hosted.apiKey?.trim();
    if (!apiKey) {
      continue;
    }
    providers.push({
      id: generateId(),
      label: hosted.type,
      type: hosted.type,
      apiKey,
      maxIterations,
    });
  }

  const preferredRaw = legacy.aiProvider ?? "";
  const preferredType = isHostedAiProviderType(preferredRaw)
    ? preferredRaw
    : null;
  const defaultEntry =
    providers.find((entry) => entry.type === preferredType) ?? providers[0];

  return {
    defaultId: defaultEntry?.id ?? null,
    providers,
  };
}

export function appendProviderEntry(
  config: AiProviderConfig,
  entry: AiProviderEntry,
): AiProviderConfig {
  const providers = [...config.providers, entry];
  const duplicate = findDuplicateProviderLabel(providers);
  if (duplicate) {
    throw new Error(`Provider label "${duplicate}" is already in use.`);
  }
  if (providers.length > MAX_AI_PROVIDERS) {
    throw new Error(`You can save at most ${MAX_AI_PROVIDERS} AI providers.`);
  }
  return {
    defaultId: config.defaultId ?? entry.id,
    providers,
  };
}

export function legacyColumnsFromConfig(config: AiProviderConfig): {
  googleApiKey: string | null;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  aiProvider: HostedAiProviderType;
  maxIterations: string;
} {
  const defaultEntry =
    findProviderById(config, config.defaultId) ?? config.providers[0];
  const google = config.providers.find((entry) => entry.type === "google");
  const anthropic = config.providers.find(
    (entry) => entry.type === "anthropic",
  );
  const openai = config.providers.find((entry) => entry.type === "openai");
  const hostedDefault =
    defaultEntry && isHostedAiProviderType(defaultEntry.type)
      ? defaultEntry
      : (google ?? anthropic ?? openai);

  return {
    googleApiKey: google?.apiKey ?? null,
    anthropicApiKey: anthropic?.apiKey ?? null,
    openaiApiKey: openai?.apiKey ?? null,
    aiProvider:
      hostedDefault && isHostedAiProviderType(hostedDefault.type)
        ? hostedDefault.type
        : "google",
    maxIterations: clampMaxIterations(
      hostedDefault?.maxIterations ?? defaultEntry?.maxIterations,
    ),
  };
}

export type ResolvedChatProvider =
  | {
      source: "list";
      entry: AiProviderEntry;
      type: AiProviderType;
      apiKey: string | null;
      maxIterations: number;
      dangling: false;
    }
  | {
      source: "legacy";
      entry: null;
      type: HostedAiProviderType;
      apiKey: string | null;
      maxIterations: number;
      dangling: false;
    }
  | {
      source: "missing";
      entry: null;
      type: null;
      apiKey: null;
      maxIterations: number;
      dangling: false;
    }
  | {
      source: "dangling";
      entry: null;
      type: null;
      apiKey: null;
      maxIterations: number;
      dangling: true;
    };

export function resolveChatProviderSelection(
  chatAiProviderId: string | null | undefined,
  config: AiProviderConfig,
  legacy: LegacyAiProviderSettings,
): ResolvedChatProvider {
  const maxFromLegacy = Number.parseInt(
    clampMaxIterations(legacy.maxIterations),
    10,
  );

  if (!isMultiAiProviders(config)) {
    const legacyTypeRaw = legacy.aiProvider ?? "";
    const type = isHostedAiProviderType(legacyTypeRaw)
      ? legacyTypeRaw
      : "google";
    const apiKey =
      type === "anthropic"
        ? (legacy.anthropicApiKey ?? null)
        : type === "openai"
          ? (legacy.openaiApiKey ?? null)
          : (legacy.googleApiKey ?? null);
    if (!apiKey?.trim()) {
      return {
        source: "missing",
        entry: null,
        type: null,
        apiKey: null,
        maxIterations: maxFromLegacy,
        dangling: false,
      };
    }
    return {
      source: "legacy",
      entry: null,
      type,
      apiKey,
      maxIterations: maxFromLegacy,
      dangling: false,
    };
  }

  if (chatAiProviderId?.trim()) {
    const entry = findProviderById(config, chatAiProviderId);
    if (!entry) {
      return {
        source: "dangling",
        entry: null,
        type: null,
        apiKey: null,
        maxIterations: maxFromLegacy,
        dangling: true,
      };
    }
    return resolvedFromEntry(entry);
  }

  const defaultEntry = findProviderById(config, config.defaultId);
  if (defaultEntry) {
    return resolvedFromEntry(defaultEntry);
  }

  const fallbackTypeRaw = legacy.aiProvider ?? "";
  const legacyType = isHostedAiProviderType(fallbackTypeRaw)
    ? fallbackTypeRaw
    : "google";
  const legacyKey =
    legacyType === "anthropic"
      ? legacy.anthropicApiKey
      : legacyType === "openai"
        ? legacy.openaiApiKey
        : legacy.googleApiKey;
  if (legacyKey?.trim()) {
    return {
      source: "legacy",
      entry: null,
      type: legacyType,
      apiKey: legacyKey,
      maxIterations: maxFromLegacy,
      dangling: false,
    };
  }

  const first = config.providers[0];
  if (first) {
    return resolvedFromEntry(first);
  }

  return {
    source: "missing",
    entry: null,
    type: null,
    apiKey: null,
    maxIterations: maxFromLegacy,
    dangling: false,
  };
}

function resolvedFromEntry(entry: AiProviderEntry): ResolvedChatProvider {
  return {
    source: "list",
    entry,
    type: entry.type,
    apiKey: entry.apiKey,
    maxIterations: Number.parseInt(clampMaxIterations(entry.maxIterations), 10),
    dangling: false,
  };
}

export function providerTypeLabel(type: AiProviderType): string {
  if (type === "anthropic") {
    return "Anthropic";
  }
  if (type === "openai") {
    return "OpenAI";
  }
  if (type === "custom") {
    return "Custom";
  }
  return "Google";
}
