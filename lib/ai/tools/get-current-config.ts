import { tool } from "ai";
import { z } from "zod";
import { chatModels } from "@/lib/ai/models";

type GetCurrentConfigOptions = {
  selectedModelId: string;
  resolvedModelId: string;
  provider: "google" | "anthropic" | "openai";
  timezone: string;
  enabledSearchDomains: string[];
};

export type GetCurrentConfigToolResult = {
  model: {
    selectedId: string;
    resolvedId: string;
    name: string;
    description: string;
    provider: "google" | "anthropic" | "openai";
  };
  configuration: {
    provider: "google" | "anthropic" | "openai";
    timezone: string;
    enabledSearchDomains: string[];
  };
};

export function createGetCurrentConfigTool(options: GetCurrentConfigOptions) {
  const {
    selectedModelId,
    resolvedModelId,
    provider,
    timezone,
    enabledSearchDomains,
  } = options;

  // Find the model info from chatModels - must match both id AND provider
  const modelInfo = chatModels.find(
    (m) => m.id === resolvedModelId && m.provider === provider,
  );

  const modelName = modelInfo?.name || resolvedModelId;
  const modelDescription = modelInfo?.description || "AI model";

  return tool({
    description:
      "Get the current AI model and configuration settings. Use this when the user asks about what model they're using, their current settings, or their configuration.",
    inputSchema: z.object({}),
    execute: (): GetCurrentConfigToolResult => {
      // Re-lookup model info at execution time to ensure we have the latest data
      const executionModelInfo = chatModels.find(
        (m) => m.id === resolvedModelId && m.provider === provider,
      );

      return {
        model: {
          selectedId: selectedModelId,
          resolvedId: resolvedModelId,
          name: executionModelInfo?.name || modelName,
          description: executionModelInfo?.description || modelDescription,
          provider,
        },
        configuration: {
          provider,
          timezone,
          enabledSearchDomains,
        },
      };
    },
  });
}
