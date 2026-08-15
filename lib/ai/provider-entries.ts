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
  const sanitizedProviders = providers.map((entry) =>
    isCanonicalSeedEntry(entry, providers)
      ? {
          ...entry,
          speedModelId: undefined,
          reasoningModelId: undefined,
        }
      : entry,
  );
  const defaultId =
    typeof record.defaultId === "string" && record.defaultId.trim()
      ? record.defaultId
      : null;
  return {
    defaultId:
      defaultId && sanitizedProviders.some((entry) => entry.id === defaultId)
        ? defaultId
        : (sanitizedProviders[0]?.id ?? null),
    providers: sanitizedProviders,
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

/** Canonical labels for the three always-present hosted provider slots. */
export const CANONICAL_SEED_LABELS: Record<HostedAiProviderType, string> = {
  google: "Google",
  anthropic: "Anthropic",
  openai: "OpenAI",
};

export function defaultLabelForProviderType(type: AiProviderType): string {
  if (type === "google") {
    return CANONICAL_SEED_LABELS.google;
  }
  if (type === "anthropic") {
    return CANONICAL_SEED_LABELS.anthropic;
  }
  if (type === "openai") {
    return CANONICAL_SEED_LABELS.openai;
  }
  return "Custom";
}

export function isCanonicalSeedEntry(
  entry: AiProviderEntry,
  knownProviders?: readonly AiProviderEntry[],
): boolean {
  if (entry.type === "custom") {
    return false;
  }
  const canonicalLabel = normalizeProviderLabel(
    CANONICAL_SEED_LABELS[entry.type],
  );
  if (normalizeProviderLabel(entry.label) !== canonicalLabel) {
    return false;
  }
  if (!knownProviders) {
    return true;
  }
  const savedCanonical = knownProviders.find(
    (provider) =>
      provider.type === entry.type &&
      normalizeProviderLabel(provider.label) === canonicalLabel,
  );
  return savedCanonical?.id === entry.id;
}

/** Clears keys and custom slots on a built-in Google/Anthropic/OpenAI seed. */
export function stockCanonicalSeedEntry(
  entry: AiProviderEntry,
): AiProviderEntry {
  if (entry.type === "custom") {
    return entry;
  }
  return {
    id: entry.id,
    label: CANONICAL_SEED_LABELS[entry.type],
    type: entry.type,
    apiKey: null,
    maxIterations: "10",
  };
}

/** User-added Google/Anthropic/OpenAI entries may override registry model slots. */
export function supportsHostedModelOverrides(
  entry: AiProviderEntry,
  knownProviders?: readonly AiProviderEntry[],
): boolean {
  return (
    entry.type !== "custom" && !isCanonicalSeedEntry(entry, knownProviders)
  );
}

export function entryUsesModelOverrides(
  entry: AiProviderEntry,
  knownProviders?: readonly AiProviderEntry[],
): boolean {
  if (entry.type === "custom") {
    return true;
  }
  return (
    supportsHostedModelOverrides(entry, knownProviders) &&
    Boolean(entry.speedModelId?.trim() && entry.reasoningModelId?.trim())
  );
}

export function ensureUniqueProviderLabel(
  label: string,
  existing: AiProviderEntry[],
  excludeId?: string,
): string {
  const base = label.trim() || "Provider";
  const others = existing.filter((entry) => entry.id !== excludeId);
  const taken = new Set(
    others.map((entry) => normalizeProviderLabel(entry.label)),
  );
  if (!taken.has(normalizeProviderLabel(base))) {
    return base;
  }

  let index = 1;
  while (taken.has(normalizeProviderLabel(`${base} (${index})`))) {
    index += 1;
  }
  return `${base} (${index})`;
}

export function suggestedLabelForType(
  type: AiProviderType,
  existing: AiProviderEntry[],
): string {
  return ensureUniqueProviderLabel(defaultLabelForProviderType(type), existing);
}

function legacyKeyForHostedType(
  type: HostedAiProviderType,
  legacy: LegacyAiProviderSettings | undefined,
): string | null {
  if (!legacy) {
    return null;
  }
  if (type === "google") {
    return legacy.googleApiKey?.trim() || null;
  }
  if (type === "anthropic") {
    return legacy.anthropicApiKey?.trim() || null;
  }
  return legacy.openaiApiKey?.trim() || null;
}

function sortProvidersWithSeedsFirst(
  providers: AiProviderEntry[],
): AiProviderEntry[] {
  const seedOrder = HOSTED_TYPES.map((type) =>
    normalizeProviderLabel(CANONICAL_SEED_LABELS[type]),
  );
  return [...providers].sort((left, right) => {
    const leftSeed = isCanonicalSeedEntry(left)
      ? seedOrder.indexOf(normalizeProviderLabel(left.label))
      : HOSTED_TYPES.length;
    const rightSeed = isCanonicalSeedEntry(right)
      ? seedOrder.indexOf(normalizeProviderLabel(right.label))
      : HOSTED_TYPES.length;
    if (leftSeed !== rightSeed) {
      return leftSeed - rightSeed;
    }
    return left.label.localeCompare(right.label);
  });
}

function pickDefaultProviderId(
  providers: AiProviderEntry[],
  legacy: LegacyAiProviderSettings | undefined,
): string | null {
  const preferredRaw = legacy?.aiProvider ?? "";
  const preferredType = isHostedAiProviderType(preferredRaw)
    ? preferredRaw
    : "google";
  const canonical = providers.find(
    (entry) => entry.type === preferredType && isCanonicalSeedEntry(entry),
  );
  if (canonical) {
    return canonical.id;
  }
  const firstWithKey = providers.find((entry) => entry.apiKey?.trim());
  return firstWithKey?.id ?? providers[0]?.id ?? null;
}

function upsertCanonicalSeed(
  providers: AiProviderEntry[],
  type: HostedAiProviderType,
  legacy: LegacyAiProviderSettings | undefined,
  maxIterations: string,
  generateId: () => string,
): { providers: AiProviderEntry[]; changed: boolean } {
  const canonical = CANONICAL_SEED_LABELS[type];
  const canonicalNorm = normalizeProviderLabel(canonical);

  const existingCanonical = providers.find(
    (entry) =>
      entry.type === type &&
      normalizeProviderLabel(entry.label) === canonicalNorm,
  );
  if (existingCanonical) {
    return { providers, changed: false };
  }

  const legacyStyleIndex = providers.findIndex(
    (entry) =>
      entry.type === type &&
      normalizeProviderLabel(entry.label) === normalizeProviderLabel(type),
  );
  if (legacyStyleIndex >= 0) {
    const next = [...providers];
    const promoted = next[legacyStyleIndex];
    if (promoted) {
      next[legacyStyleIndex] = { ...promoted, label: canonical };
    }
    return { providers: next, changed: true };
  }

  return {
    providers: [
      ...providers,
      {
        id: generateId(),
        label: canonical,
        type,
        apiKey: legacyKeyForHostedType(type, legacy),
        maxIterations,
      },
    ],
    changed: true,
  };
}

export function seedDefaultProviderList(
  legacy: LegacyAiProviderSettings = {},
  generateId: () => string = () => crypto.randomUUID(),
): AiProviderConfig {
  const maxIterations = clampMaxIterations(legacy.maxIterations);
  const providers: AiProviderEntry[] = HOSTED_TYPES.map((type) => ({
    id: generateId(),
    label: CANONICAL_SEED_LABELS[type],
    type,
    apiKey: legacyKeyForHostedType(type, legacy),
    maxIterations,
  }));

  return {
    defaultId: pickDefaultProviderId(providers, legacy),
    providers,
  };
}

export function ensureSeededProviderConfig(
  config: AiProviderConfig | null | undefined,
  legacy: LegacyAiProviderSettings = {},
  generateId: () => string = () => crypto.randomUUID(),
): AiProviderConfig {
  const parsed = parseAiProviderConfig(config);
  const maxIterations = clampMaxIterations(legacy.maxIterations);

  if (parsed.providers.length === 0) {
    return seedDefaultProviderList(legacy, generateId);
  }

  let providers = [...parsed.providers];
  let changed = false;

  for (const type of HOSTED_TYPES) {
    const result = upsertCanonicalSeed(
      providers,
      type,
      legacy,
      maxIterations,
      generateId,
    );
    providers = result.providers;
    changed = changed || result.changed;
  }

  providers = sortProvidersWithSeedsFirst(providers);

  let defaultId = parsed.defaultId;
  if (!defaultId || !providers.some((entry) => entry.id === defaultId)) {
    defaultId = pickDefaultProviderId(providers, legacy);
    changed = true;
  }

  if (!changed) {
    return parsed;
  }

  return { defaultId, providers };
}

export function assertCanonicalSeedsPresent(
  providers: AiProviderEntry[],
): void {
  for (const type of HOSTED_TYPES) {
    const label = CANONICAL_SEED_LABELS[type];
    const hasSeed = providers.some(
      (entry) =>
        entry.type === type &&
        normalizeProviderLabel(entry.label) === normalizeProviderLabel(label),
    );
    if (!hasSeed) {
      throw new Error(`The ${label} provider cannot be removed.`);
    }
  }
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

export function isProviderEntryConfigured(entry: AiProviderEntry): boolean {
  if (entry.type === "custom") {
    return Boolean(
      entry.baseUrl?.trim() &&
        entry.speedModelId?.trim() &&
        entry.reasoningModelId?.trim(),
    );
  }
  return Boolean(entry.apiKey?.trim());
}

export function resolveDefaultProviderId(
  config: AiProviderConfig,
  preferredId?: string | null,
): string | null {
  if (preferredId) {
    const preferred = findProviderById(config, preferredId);
    if (preferred && isProviderEntryConfigured(preferred)) {
      return preferred.id;
    }
  }

  const current = findProviderById(config, config.defaultId);
  if (current && isProviderEntryConfigured(current)) {
    return config.defaultId;
  }

  const firstConfigured = config.providers.find(isProviderEntryConfigured);
  return firstConfigured?.id ?? null;
}

/** Stored chat provider if it is still configured; otherwise the default. */
export function findUsableChatProvider(
  config: AiProviderConfig,
  chatAiProviderId?: string | null,
): AiProviderEntry | undefined {
  if (chatAiProviderId?.trim()) {
    const stored = findProviderById(config, chatAiProviderId);
    if (stored && isProviderEntryConfigured(stored)) {
      return stored;
    }
  }
  const fallbackId = resolveDefaultProviderId(config);
  return fallbackId ? findProviderById(config, fallbackId) : undefined;
}

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

  const usable = findUsableChatProvider(config, chatAiProviderId);
  if (usable) {
    return resolvedFromEntry(usable);
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

/** Subtitle for in-chat provider picker rows. */
export function providerSelectorSubtitle(
  entry: AiProviderEntry,
  knownProviders?: readonly AiProviderEntry[],
): string {
  if (entry.type === "custom") {
    return "Custom";
  }
  const base = providerTypeLabel(entry.type);
  if (supportsHostedModelOverrides(entry, knownProviders)) {
    return `${base} (custom)`;
  }
  return base;
}
