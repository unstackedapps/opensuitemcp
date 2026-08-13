import "server-only";
import { decrypt, encrypt } from "../encryption";
import { assertAllowedProviderUrl } from "./custom-provider-url";
import {
  type AiProviderConfig,
  type AiProviderEntry,
  appendProviderEntry,
  clampMaxIterations,
  findDuplicateProviderLabel,
  findProviderById,
  isMultiAiProviders,
  MAX_AI_PROVIDER_LABEL_LENGTH,
  MAX_AI_PROVIDERS,
  migrateLegacyKeysToEntries,
  parseAiProviderConfig,
} from "./provider-entries";

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
  const incoming = parseAiProviderConfig(params.incoming);
  const existing = parseAiProviderConfig(params.existingConfig);

  if (incoming.providers.length === 0) {
    if (isMultiAiProviders(existing)) {
      throw new Error("Cannot remove the last AI provider after switching.");
    }
    return { defaultId: null, providers: [] };
  }

  if (incoming.providers.length > MAX_AI_PROVIDERS) {
    throw new Error(`You can save at most ${MAX_AI_PROVIDERS} AI providers.`);
  }

  const duplicate = findDuplicateProviderLabel(incoming.providers);
  if (duplicate) {
    throw new Error(`Provider label "${duplicate}" is already in use.`);
  }

  const encryptedIncoming = await Promise.all(
    incoming.providers.map((entry) =>
      encryptIncomingEntry(entry, findProviderById(existing, entry.id)),
    ),
  );

  if (!isMultiAiProviders(existing)) {
    const migrated = migrateLegacyKeysToEntries(params.legacy);
    let merged = migrated;
    for (const entry of encryptedIncoming) {
      merged = appendProviderEntry(merged, entry);
    }
    if (!merged.defaultId) {
      merged = {
        ...merged,
        defaultId: merged.providers[0]?.id ?? null,
      };
    }
    return merged;
  }

  if (encryptedIncoming.length === 0) {
    throw new Error("Cannot remove the last AI provider after switching.");
  }

  const defaultId =
    incoming.defaultId &&
    encryptedIncoming.some((entry) => entry.id === incoming.defaultId)
      ? incoming.defaultId
      : (encryptedIncoming[0]?.id ?? null);

  return {
    defaultId,
    providers: encryptedIncoming,
  };
}

async function encryptIncomingEntry(
  incoming: AiProviderEntry,
  existing: AiProviderEntry | undefined,
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
  } else {
    const nextKey = incoming.apiKey?.trim() || existing?.apiKey?.trim();
    if (!nextKey) {
      throw new Error(`Enter an API key for ${label}.`);
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
    speedModelId:
      incoming.type === "custom" ? incoming.speedModelId?.trim() : undefined,
    reasoningModelId:
      incoming.type === "custom"
        ? incoming.reasoningModelId?.trim()
        : undefined,
  };
}
