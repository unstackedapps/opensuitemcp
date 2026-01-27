export const DEFAULT_CHAT_MODEL: string = "chat-model";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
  provider?: "google" | "anthropic" | "openai";
};

export const chatModels: ChatModel[] = [
  {
    id: "chat-model",
    name: "Gemini 2.5 Flash (Speed Mode)",
    description:
      "Prioritized for low-latency tool execution and simple function calls.",
    provider: "google",
  },
  {
    id: "chat-model-reasoning",
    name: "Gemini 2.5 Pro (Enhanced Reasoning)",
    description:
      "Activates Gemini's internal 'thinking' process to improve success rates on complex agent tasks, chained tool calls, and structured data analysis.",
    provider: "google",
  },
  {
    id: "chat-model",
    name: "Claude 4.5 Haiku (Speed Mode)",
    description:
      "Fast and efficient for quick responses and tool calls. Best for simple tasks.",
    provider: "anthropic",
  },
  {
    id: "chat-model-reasoning",
    name: "Claude Sonnet 4 (Enhanced Reasoning)",
    description:
      "Advanced reasoning with extended thinking support for complex agent tasks, chained tool calls, and structured data analysis.",
    provider: "anthropic",
  },
  {
    id: "chat-model",
    name: "GPT-5 Mini (Speed Mode)",
    description:
      "Fast and efficient for quick responses and tool calls. Optimized for low latency and high throughput. Best for simple tasks.",
    provider: "openai",
  },
  {
    id: "chat-model-reasoning",
    name: "O4 Mini (Enhanced Reasoning)",
    description:
      "Advanced reasoning model for complex agent tasks, chained tool calls, and structured data analysis. Uses OpenAI's o4 reasoning architecture.",
    provider: "openai",
  },
];
