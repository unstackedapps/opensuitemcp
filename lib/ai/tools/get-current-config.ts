import { tool } from "ai";
import { z } from "zod";
import { chatModels } from "@/lib/ai/models";
import type { AiProviderType } from "@/lib/ai/provider-entries";

type GetCurrentConfigOptions = {
  selectedModelId: string;
  resolvedModelId: string;
  provider: AiProviderType;
  timezone: string;
  enabledSearchDomains: string[];
  enabledSkills?: string[];
  modelName?: string;
  modelDescription?: string;
};

export type GetCurrentConfigToolResult = {
  model: {
    selectedId: string;
    resolvedId: string;
    name: string;
    description: string;
    provider: AiProviderType;
  };
  configuration: {
    provider: AiProviderType;
    timezone: string;
    enabledSearchDomains: string[];
    enabledSkills: string[];
  };
};

export function createGetCurrentConfigTool(options: GetCurrentConfigOptions) {
  const {
    selectedModelId,
    resolvedModelId,
    provider,
    timezone,
    enabledSearchDomains,
    enabledSkills = [],
    modelName: modelNameOverride,
    modelDescription: modelDescriptionOverride,
  } = options;

  // Find the model info from chatModels - must match both id AND provider
  const modelInfo =
    provider === "custom"
      ? undefined
      : chatModels.find(
          (m) => m.id === resolvedModelId && m.provider === provider,
        );

  const modelName = modelNameOverride || modelInfo?.name || resolvedModelId;
  const modelDescription =
    modelDescriptionOverride || modelInfo?.description || "AI model";

  return tool({
    description:
      "Get the current AI model, configuration, and enabled skills. Use this when the user asks about what model they're using, their settings, or which skills are active.",
    inputSchema: z.object({}),
    execute: (): GetCurrentConfigToolResult => {
      // Re-lookup model info at execution time to ensure we have the latest data
      const executionModelInfo =
        provider === "custom"
          ? undefined
          : chatModels.find(
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
          enabledSkills,
        },
      };
    },
  });
}
