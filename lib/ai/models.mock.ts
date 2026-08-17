import type { LanguageModel } from "ai";

type PromptMessage = {
  role?: string;
  content?:
    | string
    | Array<{ type?: string; text?: string }>;
};

function lastUserText(prompt: unknown): string {
  if (!Array.isArray(prompt)) {
    return "";
  }
  const last = prompt.at(-1) as PromptMessage | undefined;
  if (!last) {
    return "";
  }
  if (typeof last.content === "string") {
    return last.content;
  }
  if (!Array.isArray(last.content)) {
    return "";
  }
  return last.content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function textStreamChunks(text: string, id = "mock-id") {
  const words = text.split(" ").filter(Boolean);
  return [
    { type: "text-start" as const, id },
    ...words.map((word, index) => ({
      type: "text-delta" as const,
      id,
      delta: index === words.length - 1 ? word : `${word} `,
    })),
    { type: "text-end" as const, id },
    {
      type: "finish" as const,
      finishReason: "stop" as const,
      usage: { inputTokens: 3, outputTokens: 10, totalTokens: 13 },
    },
  ];
}

function chunksForPrompt(prompt: unknown, withReasoning = false) {
  const text = lastUserText(prompt);

  if (text.includes("Why is the sky blue?")) {
    const body = textStreamChunks("It's just blue duh!");
    if (!withReasoning) {
      return body;
    }
    return [
      { type: "reasoning-start" as const, id: "reason-id" },
      {
        type: "reasoning-delta" as const,
        id: "reason-id",
        delta: "The sky is blue because of rayleigh scattering!",
      },
      { type: "reasoning-end" as const, id: "reason-id" },
      ...body,
    ];
  }

  if (text.includes("Why is grass green?")) {
    const body = textStreamChunks("It's just green duh!");
    if (!withReasoning) {
      return body;
    }
    return [
      { type: "reasoning-start" as const, id: "reason-id" },
      {
        type: "reasoning-delta" as const,
        id: "reason-id",
        delta: "Grass is green because of chlorophyll absorption!",
      },
      { type: "reasoning-end" as const, id: "reason-id" },
      ...body,
    ];
  }

  if (text.includes("What's the weather in sf?")) {
    return textStreamChunks(
      "The current temperature in San Francisco is 17°C.",
    );
  }

  if (text.includes("Thanks!")) {
    return textStreamChunks("You're welcome!");
  }

  return textStreamChunks("Mock response");
}

const createMockModel = (withReasoning = false): LanguageModel => {
  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-model",
    defaultObjectGenerationMode: "tool",
    supportedUrls: [],
    supportsImageUrls: false,
    supportsStructuredOutputs: false,
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      content: [{ type: "text", text: "Hello, world!" }],
      warnings: [],
    }),
    doStream: async ({ prompt }: { prompt: unknown }) => {
      const chunks = chunksForPrompt(prompt, withReasoning);
      return {
        stream: new ReadableStream({
          async start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
              await new Promise((resolve) => {
                setTimeout(resolve, 40);
              });
            }
            controller.close();
          },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  } as unknown as LanguageModel;
};

export const chatModel = createMockModel(false);
export const reasoningModel = createMockModel(true);
export const titleModel = createMockModel(false);
