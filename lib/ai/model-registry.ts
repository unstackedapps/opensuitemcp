/**
 * Canonical BYOLLM model slots used by the app + marketing.
 * Pattern per provider: one Speed (fast/cheap) + one Reasoning (deeper).
 */

export type ModelProviderId = "openai" | "anthropic" | "google";
export type ModelSlot = "speed" | "reasoning";

export type RegisteredModel = {
  provider: ModelProviderId;
  slot: ModelSlot;
  /** Provider API model id (wired into AI SDK) */
  apiModelId: string;
  /** OpenRouter id for public list-price lookup (prompt/completion are per-token) */
  openRouterId: string;
  name: string;
  blurb: string;
  docsUrl: string;
};

export type ProviderMeta = {
  id: ModelProviderId;
  name: string;
  tagline: string;
  docsUrl: string;
};

export const PROVIDER_META: ProviderMeta[] = [
  {
    id: "google",
    name: "Google",
    tagline: "Your Gemini API key. Flash for speed, Pro for harder sessions.",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    tagline:
      "Your Anthropic key. Haiku for speed, Sonnet for deeper tool chains.",
    docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
  },
  {
    id: "openai",
    name: "OpenAI",
    tagline:
      "Your OpenAI key. Speed and Reasoning modes map to current GPT models.",
    docsUrl: "https://platform.openai.com/docs/models",
  },
];

export const REGISTERED_MODELS: RegisteredModel[] = [
  {
    provider: "google",
    slot: "speed",
    apiModelId: "gemini-3.5-flash",
    openRouterId: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    blurb: "Speed mode — low-latency MCP calls and short answers.",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
  },
  {
    provider: "google",
    slot: "reasoning",
    apiModelId: "gemini-3.1-pro-preview",
    openRouterId: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    blurb: "Reasoning mode — deeper SuiteQL / multi-tool sessions.",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
  },
  {
    provider: "anthropic",
    slot: "speed",
    apiModelId: "claude-haiku-4-5-20251001",
    openRouterId: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    blurb: "Speed mode — snappy, economical turns for simple tool loops.",
    docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
  },
  {
    provider: "anthropic",
    slot: "reasoning",
    apiModelId: "claude-sonnet-5",
    openRouterId: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    blurb: "Reasoning mode — stronger planning across MCP tool chains.",
    docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
  },
  {
    provider: "openai",
    slot: "speed",
    apiModelId: "gpt-5.4-mini",
    openRouterId: "openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    blurb: "Speed mode — fast, lower-cost tool calls and everyday SuiteQL.",
    docsUrl: "https://developers.openai.com/api/docs/models/gpt-5.4-mini",
  },
  {
    provider: "openai",
    slot: "reasoning",
    apiModelId: "gpt-5.4",
    openRouterId: "openai/gpt-5.4",
    name: "GPT-5.4",
    blurb: "Reasoning mode — multi-step agent work and harder analysis.",
    docsUrl: "https://developers.openai.com/api/docs/models/gpt-5.4",
  },
];

export function apiModelFor(
  provider: ModelProviderId,
  slot: ModelSlot,
): string {
  const match = REGISTERED_MODELS.find(
    (model) => model.provider === provider && model.slot === slot,
  );
  if (!match) {
    throw new Error(`No model registered for ${provider}/${slot}`);
  }
  return match.apiModelId;
}

export function modelsForProvider(
  provider: ModelProviderId,
): RegisteredModel[] {
  return REGISTERED_MODELS.filter((model) => model.provider === provider);
}
