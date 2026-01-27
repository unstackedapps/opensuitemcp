import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";

function createGoogleProvider(apiKey?: string) {
  // Create a custom Google provider instance with the API key if provided
  // If no API key is provided, use the default provider (which uses env var)
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

  return customProvider({
    languageModels: {
      // Base model for fast responses
      "chat-model": googleProvider("gemini-2.5-flash"),

      // Uses native Gemini thinking for enhanced complex reasoning
      "chat-model-reasoning": googleProvider("gemini-2.5-pro"),

      // Model for generating chat titles
      "title-model": googleProvider("gemini-2.5-flash"),
    },
  });
}

function createAnthropicProvider(apiKey?: string) {
  // Create a custom Anthropic provider instance with the API key if provided
  // If no API key is provided, use the default provider (which uses env var)
  const anthropicProvider = apiKey ? createAnthropic({ apiKey }) : anthropic;

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

  return customProvider({
    languageModels: {
      // Base model for fast responses (using Claude 4.5 Haiku)
      // Note: Using 'as never' because Anthropic provider types don't perfectly align with customProvider's expected LanguageModelV2 type
      "chat-model": anthropicProvider("claude-haiku-4-5-20251001") as never,

      // Uses advanced reasoning (using Claude Sonnet 4 - explicitly supports thinking/reasoning)
      // See: https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic#reasoning
      "chat-model-reasoning": anthropicProvider(
        "claude-sonnet-4-20250514",
      ) as never,

      // Model for generating chat titles
      "title-model": anthropicProvider("claude-haiku-4-5-20251001") as never,
    },
  });
}

function createOpenAIProvider(apiKey?: string) {
  // Create a custom OpenAI provider instance with the API key if provided
  // If no API key is provided, use the default provider (which uses env var)
  const openaiProvider = apiKey ? createOpenAI({ apiKey }) : openai;

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

  return customProvider({
    languageModels: {
      // Base model for fast responses (using GPT-5-mini)
      // Optimized for low latency and high throughput, equivalent to Gemini 2.5 Flash
      // Uses responses API (default in AI SDK 6) which supports v3 models
      // Note: Using 'as never' because OpenAI provider types don't perfectly align with customProvider's expected LanguageModelV2 type
      "chat-model": openaiProvider("gpt-5-mini") as never,

      // Uses advanced reasoning (using o4-mini - OpenAI's reasoning model)
      // Equivalent to Gemini 2.5 Pro with thinking capabilities
      // o4-mini supports reasoningEffort and reasoningSummary features
      "chat-model-reasoning": openaiProvider("o4-mini") as never,

      // Model for generating chat titles (using GPT-5-mini for fast title generation)
      // Uses responses API for v3 model support
      "title-model": openaiProvider("gpt-5-mini") as never,
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

/**
 * Create a provider with a user-specific API key
 * @param apiKey - User's API key (encrypted, will be decrypted)
 * @param provider - Provider type: "google", "anthropic", or "openai"
 * @throws Error if no API key is provided and env var is not set
 */
export function getUserProvider(
  apiKey?: string | null,
  provider: "google" | "anthropic" | "openai" = "google",
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
