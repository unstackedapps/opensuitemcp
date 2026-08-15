import "server-only";
import { upsertUserSettings } from "../db/queries";
import type { UserSettings } from "../db/schema";
import { decrypt, encrypt } from "../encryption";
import { assertAllowedProviderUrl } from "./custom-provider-url";
import {
  type AiProviderConfig,
  type AiProviderEntry,
  assertCanonicalSeedsPresent,
  clampMaxIterations,
  ensureSeededProviderConfig,
  findDuplicateProviderLabel,
  findProviderById,
  MAX_AI_PROVIDER_LABEL_LENGTH,
  MAX_AI_PROVIDERS,
  parseAiProviderConfig,
  resolveDefaultProviderId,
  supportsHostedModelOverrides,
} from "./provider-entries";

function legacyFromUserSettings(settings: UserSettings) {
  return {
    googleApiKey: settings.googleApiKey,
    anthropicApiKey: settings.anthropicApiKey,
    openaiApiKey: settings.openaiApiKey,
    aiProvider: settings.aiProvider,
    maxIterations: settings.maxIterations,
  };
}

export function decryptProviderConfig(
  config: AiProviderConfig | null | undefined,
): AiProviderConfig {
  const parsed = parseAiProviderConfig(config);
  return {
    defaultId: parsed.defaultId,
    providers: parsed.providers.map((entry) => ({
      ...entry,
      apiKey: decryptStoredKey(entry.apiKey),
    })),
  };
}

function decryptStoredKey(value: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    return decrypt(value) || null;
  } catch {
    return null;
  }
}

export async function persistProviderConfig(params: {
  incoming: unknown;
  existingConfig: AiProviderConfig;
  legacy: {
    googleApiKey?: string | null;
    anthropicApiKey?: string | null;
    openaiApiKey?: string | null;
    aiProvider?: string | null;
    maxIterations?: string | null;
  };
}): Promise<AiProviderConfig> {
  const existing = parseAiProviderConfig(params.existingConfig);
  const seeded = ensureSeededProviderConfig(
    parseAiProviderConfig(params.incoming),
    params.legacy,
  );

  assertCanonicalSeedsPresent(seeded.providers);

  if (seeded.providers.length > MAX_AI_PROVIDERS) {
    throw new Error(`You can save at most ${MAX_AI_PROVIDERS} AI providers.`);
  }

  const duplicate = findDuplicateProviderLabel(seeded.providers);
  if (duplicate) {
    throw new Error(`Provider label "${duplicate}" is already in use.`);
  }

  const encryptedIncoming = await Promise.all(
    seeded.providers.map((entry) =>
      encryptIncomingEntry(
        entry,
        findProviderById(existing, entry.id),
        seeded.providers,
      ),
    ),
  );

  const defaultId =
    seeded.defaultId &&
    encryptedIncoming.some((entry) => entry.id === seeded.defaultId)
      ? seeded.defaultId
      : (encryptedIncoming[0]?.id ?? null);

  return {
    defaultId: resolveDefaultProviderId({
      defaultId,
      providers: encryptedIncoming,
    }),
    providers: encryptedIncoming,
  };
}

export async function updateDefaultAiProviderId(params: {
  userId: string;
  providerId: string | null;
  settings: UserSettings;
}): Promise<AiProviderConfig> {
  const existing = parseAiProviderConfig(params.settings.aiProviders);
  const decrypted = decryptProviderConfig(params.settings.aiProviders);

  if (params.providerId && !findProviderById(decrypted, params.providerId)) {
    throw new Error("Unknown AI provider.");
  }

  const persisted = await persistProviderConfig({
    incoming: {
      ...decrypted,
      defaultId: params.providerId,
    },
    existingConfig: existing,
    legacy: legacyFromUserSettings(params.settings),
  });

  await upsertUserSettings({
    userId: params.userId,
    aiProviders: persisted,
  });

  return persisted;
}

async function encryptIncomingEntry(
  incoming: AiProviderEntry,
  existing: AiProviderEntry | undefined,
  knownProviders: AiProviderEntry[],
): Promise<AiProviderEntry> {
  const label = incoming.label.trim();
  if (!label || label.length > MAX_AI_PROVIDER_LABEL_LENGTH) {
    throw new Error("Each provider needs a unique label (max 64 characters).");
  }

  if (incoming.type === "custom") {
    if (!incoming.baseUrl?.trim()) {
      throw new Error("Custom providers require a base URL.");
    }
    await assertAllowedProviderUrl(incoming.baseUrl);
    if (!incoming.speedModelId?.trim() || !incoming.reasoningModelId?.trim()) {
      throw new Error(
        "Pick Speed and Reasoning models from the custom endpoint list.",
      );
    }
  }

  const plaintext = incoming.apiKey?.trim() ?? "";
  let apiKey = existing?.apiKey ?? null;
  if (plaintext) {
    apiKey = encrypt(plaintext);
  } else if (incoming.type === "custom") {
    apiKey = null;
  } else {
    apiKey = existing?.apiKey ?? null;
  }

  return {
    id: incoming.id || crypto.randomUUID(),
    label,
    type: incoming.type,
    apiKey,
    maxIterations: clampMaxIterations(incoming.maxIterations),
    baseUrl: incoming.type === "custom" ? incoming.baseUrl?.trim() : undefined,
    speedModelId: shouldPersistModelIds(incoming, knownProviders)
      ? incoming.speedModelId?.trim() || undefined
      : undefined,
    reasoningModelId: shouldPersistModelIds(incoming, knownProviders)
      ? incoming.reasoningModelId?.trim() || undefined
      : undefined,
  };
}

function shouldPersistModelIds(
  entry: AiProviderEntry,
  knownProviders: AiProviderEntry[],
): boolean {
  return (
    entry.type === "custom" ||
    supportsHostedModelOverrides(entry, knownProviders)
  );
}
