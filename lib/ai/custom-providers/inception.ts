import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { customProvider } from "ai";

type InceptionReasoningMetadata = {
  reasoningSummary: string;
};

type InceptionProviderOptions = {
  reasoningEffort?: string;
  reasoning_effort?: string;
  reasoning_summary?: boolean;
  reasoning_summary_wait?: boolean;
  diffusing?: boolean;
};

function extractInceptionReasoningSummary(
  payload: unknown,
): string | undefined {
  if (!payload || typeof payload !== "object") {
    return;
  }

  if (
    "reasoning_summary" in payload &&
    typeof payload.reasoning_summary === "string"
  ) {
    return payload.reasoning_summary;
  }

  if ("choices" in payload && Array.isArray(payload.choices)) {
    const [firstChoice] = payload.choices;
    const message = firstChoice?.message as { reasoning_summary?: unknown };
    const delta = firstChoice?.delta as { reasoning_summary?: unknown };

    if (typeof message?.reasoning_summary === "string") {
      return message.reasoning_summary;
    }

    if (typeof delta?.reasoning_summary === "string") {
      return delta.reasoning_summary;
    }
  }
}

type InceptionStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: unknown;
      reasoning_summary?: unknown;
    };
  }>;
};

/** Extracts diffusion content from raw Inception stream chunks (for onChunk/raw chunks). */
export function extractDiffusionContent(rawValue: unknown): string | undefined {
  if (!rawValue) {
    return;
  }

  const parsed =
    typeof rawValue === "string"
      ? (() => {
          try {
            return JSON.parse(rawValue) as unknown;
          } catch {
            return;
          }
        })()
      : rawValue;

  if (!parsed || typeof parsed !== "object") {
    return;
  }

  const payload = parsed as InceptionStreamChunk;
  const delta = payload.choices?.[0]?.delta;
  if (typeof delta?.content === "string") {
    return delta.content;
  }
}

function createInceptionApiClient(apiKey?: string) {
  return createOpenAICompatible({
    apiKey,
    baseURL: "https://api.inceptionlabs.ai/v1",
    includeUsage: true,
    metadataExtractor: {
      extractMetadata: async ({ parsedBody }) => {
        const reasoningSummary = extractInceptionReasoningSummary(parsedBody);
        return reasoningSummary
          ? {
              inception: {
                reasoningSummary,
              } satisfies InceptionReasoningMetadata,
            }
          : undefined;
      },
      createStreamExtractor: () => {
        let reasoningSummary: string | undefined;

        return {
          processChunk(parsedChunk) {
            const summary = extractInceptionReasoningSummary(parsedChunk);
            if (summary) {
              reasoningSummary = summary;
            }
          },
          buildMetadata() {
            return reasoningSummary
              ? {
                  inception: {
                    reasoningSummary,
                  } satisfies InceptionReasoningMetadata,
                }
              : undefined;
          },
        };
      },
    },
    transformRequestBody: (body) => {
      const providerOptions = body?.providerOptions?.inception as
        | InceptionProviderOptions
        | undefined;
      if (!providerOptions) {
        return body;
      }

      const reasoningEffort =
        providerOptions.reasoningEffort ?? providerOptions.reasoning_effort;
      const reasoningSummary = providerOptions.reasoning_summary;
      const reasoningSummaryWait = providerOptions.reasoning_summary_wait;
      const diffusing = providerOptions.diffusing;

      return {
        ...body,
        stream: body.stream ?? true,
        diffusing: body.diffusing ?? diffusing,
        ...(reasoningEffort
          ? { reasoning_effort: body.reasoning_effort ?? reasoningEffort }
          : {}),
        ...(reasoningSummary !== undefined
          ? { reasoning_summary: body.reasoning_summary ?? reasoningSummary }
          : {}),
        ...(reasoningSummaryWait !== undefined
          ? {
              reasoning_summary_wait:
                body.reasoning_summary_wait ?? reasoningSummaryWait,
            }
          : {}),
      };
    },
    name: "inception",
  });
}

export function createInceptionProvider(apiKey?: string) {
  if (apiKey) {
    console.log(
      "[Provider] Creating Inception provider with API key, length:",
      apiKey.length,
    );
  } else {
    console.log(
      "[Provider] Creating Inception provider without API key (using env var)",
    );
  }

  const inceptionApiClient = createInceptionApiClient(apiKey);

  return customProvider({
    languageModels: {
      // Mercury 2 is the model used for all Inception chat modes
      "chat-model": inceptionApiClient.chatModel("mercury-2") as never,
      "chat-model-reasoning": inceptionApiClient.chatModel(
        "mercury-2",
      ) as never,
      "title-model": inceptionApiClient.chatModel("mercury-2") as never,
    },
  });
}
