import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";
import { apiModelFor } from "./model-registry";
import {
  type AiProviderType,
  openaiCompatibleBaseUrl,
} from "./provider-entries";

/** Pin hosted vendors so OPENAI_BASE_URL / ANTHROPIC_BASE_URL (e.g. LM Studio) cannot hijack them. */
const HOSTED_OPENAI_BASE_URL = "https://api.openai.com/v1";
const HOSTED_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

function createGoogleProvider(apiKey?: string) {
  const googleProvider = apiKey ? createGoogleGenerativeAI({ apiKey }) : google;

  if (apiKey) {
    console.log(
      "[Provider] Creating Google provider with API key, length:",
      apiKey.length,
    );
  } else {
    console.log(
      "[Provider] Creating Google provider without API key (using env var)",
    );
  }

  const speed = apiModelFor("google", "speed");
  const reasoning = apiModelFor("google", "reasoning");

  return customProvider({
    languageModels: {
      "chat-model": googleProvider(speed),
      "chat-model-reasoning": googleProvider(reasoning),
      "title-model": googleProvider(speed),
    },
  });
}

function createAnthropicProvider(apiKey?: string) {
  const anthropicProvider = createAnthropic({
    apiKey,
    baseURL: HOSTED_ANTHROPIC_BASE_URL,
  });

  if (apiKey) {
    console.log(
      "[Provider] Creating Anthropic provider with API key, length:",
      apiKey.length,
    );
  } else {
    console.log(
      "[Provider] Creating Anthropic provider without API key (using env var)",
    );
  }

  const speed = apiModelFor("anthropic", "speed");
  const reasoning = apiModelFor("anthropic", "reasoning");

  return customProvider({
    languageModels: {
      // Note: `as never` — Anthropic provider types vs customProvider LanguageModel
      "chat-model": anthropicProvider(speed) as never,
      "chat-model-reasoning": anthropicProvider(reasoning) as never,
      "title-model": anthropicProvider(speed) as never,
    },
  });
}

function createOpenAICompatibleProvider(params: {
  apiKey?: string | null;
  baseUrl?: string;
  speedModelId: string;
  reasoningModelId: string;
}) {
  const openaiProvider = createOpenAI({
    apiKey: params.apiKey?.trim() || "ollama",
    name: "custom",
    ...(params.baseUrl
      ? { baseURL: openaiCompatibleBaseUrl(params.baseUrl) }
      : {}),
  });

  // Chat Completions — local/compatible servers (LM Studio, vLLM, etc.) do not implement /v1/responses.
  return customProvider({
    languageModels: {
      "chat-model": openaiProvider.chat(params.speedModelId) as never,
      "chat-model-reasoning": openaiProvider.chat(
        params.reasoningModelId,
      ) as never,
      "title-model": openaiProvider.chat(params.speedModelId) as never,
    },
  });
}

function createOpenAIProvider(apiKey?: string) {
  const openaiProvider = createOpenAI({
    apiKey,
    baseURL: HOSTED_OPENAI_BASE_URL,
  });

  if (apiKey) {
    console.log(
      "[Provider] Creating OpenAI provider with API key, length:",
      apiKey.length,
    );
  } else {
    console.log(
      "[Provider] Creating OpenAI provider without API key (using env var)",
    );
  }

  const speed = apiModelFor("openai", "speed");
  const reasoning = apiModelFor("openai", "reasoning");

  return customProvider({
    languageModels: {
      "chat-model": openaiProvider(speed) as never,
      "chat-model-reasoning": openaiProvider(reasoning) as never,
      "title-model": openaiProvider(speed) as never,
    },
  });
}

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
        },
      });
    })()
  : createGoogleProvider();

export type GetUserProviderOptions = {
  baseUrl?: string;
  speedModelId?: string;
  reasoningModelId?: string;
};

/**
 * Create a provider with a user-specific API key
 * @param apiKey - User's API key (already decrypted)
 * @param provider - Provider type
 * @throws Error if no API key is provided and env var is not set
 */
export function getUserProvider(
  apiKey?: string | null,
  provider: AiProviderType = "google",
  options: GetUserProviderOptions = {},
) {
  if (isTestEnvironment) {
    const { chatModel, reasoningModel, titleModel } = require("./models.mock");
    return customProvider({
      languageModels: {
        "chat-model": chatModel,
        "chat-model-reasoning": reasoningModel,
        "title-model": titleModel,
      },
    });
  }

  if (provider === "custom") {
    if (!options.baseUrl?.trim()) {
      throw new Error("Custom provider base URL is required.");
    }
    if (!options.speedModelId?.trim() || !options.reasoningModelId?.trim()) {
      throw new Error(
        "Custom provider Speed and Reasoning models are required.",
      );
    }
    return createOpenAICompatibleProvider({
      apiKey,
      baseUrl: options.baseUrl,
      speedModelId: options.speedModelId,
      reasoningModelId: options.reasoningModelId,
    });
  }

  if (provider === "anthropic") {
    if (!apiKey) {
      throw new Error(
        "API key is required. Please set your API key in Settings.",
      );
    }

    return createAnthropicProvider(apiKey);
  }

  if (provider === "openai") {
    if (!apiKey) {
      throw new Error(
        "API key is required. Please set your API key in Settings.",
      );
    }

    return createOpenAIProvider(apiKey);
  }

  // Default to Google
  if (!apiKey) {
    throw new Error(
      "API key is required. Please set your API key in Settings.",
    );
  }

  return createGoogleProvider(apiKey);
}
