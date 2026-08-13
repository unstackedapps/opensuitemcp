import "server-only";
import type { UserSettings } from "../db/schema";
import { decrypt } from "../encryption";
import {
  type AiProviderEntry,
  type AiProviderType,
  parseAiProviderConfig,
  resolveChatProviderSelection,
} from "./provider-entries";

export type ResolvedUserChatProvider = {
  dangling: boolean;
  missing: boolean;
  type: AiProviderType | null;
  apiKey: string | null;
  maxIterations: number;
  entry: AiProviderEntry | null;
  label: string | null;
};

export function resolveUserChatProvider(params: {
  chatAiProviderId?: string | null;
  settings: UserSettings | null;
}): ResolvedUserChatProvider {
  const selection = resolveChatProviderSelection(
    params.chatAiProviderId,
    parseAiProviderConfig(params.settings?.aiProviders),
    {
      googleApiKey: params.settings?.googleApiKey,
      anthropicApiKey: params.settings?.anthropicApiKey,
      openaiApiKey: params.settings?.openaiApiKey,
      aiProvider: params.settings?.aiProvider,
      maxIterations: params.settings?.maxIterations,
    },
  );

  if (selection.dangling) {
    return {
      dangling: true,
      missing: false,
      type: null,
      apiKey: null,
      maxIterations: selection.maxIterations,
      entry: null,
      label: null,
    };
  }

  if (selection.source === "missing" || !selection.type) {
    return {
      dangling: false,
      missing: true,
      type: null,
      apiKey: null,
      maxIterations: selection.maxIterations,
      entry: null,
      label: null,
    };
  }

  let apiKey: string | null = null;
  if (selection.apiKey?.trim()) {
    try {
      apiKey = decrypt(selection.apiKey) || null;
    } catch {
      apiKey = null;
    }
  }

  return {
    dangling: false,
    missing: false,
    type: selection.type,
    apiKey,
    maxIterations: selection.maxIterations,
    entry: selection.entry,
    label: selection.entry?.label ?? selection.type,
  };
}
