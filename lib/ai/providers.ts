import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
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
 * @param provider - Provider type: "google" or "anthropic"
 * @throws Error if no API key is provided and env var is not set
 */
export function getUserProvider(
  apiKey?: string | null,
  provider: "google" | "anthropic" = "google",
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

  // Default to Google
  if (!apiKey) {
    throw new Error(
      "API key is required. Please set your API key in Settings.",
    );
  }

  return createGoogleProvider(apiKey);
}
