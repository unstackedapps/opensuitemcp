import type { LanguageModelUsage } from "ai";
import type { UsageData } from "tokenlens/helpers";
import type { ContextBreakdownPart } from "@/lib/ai/context-breakdown-types";

export type { ContextBreakdownPart } from "@/lib/ai/context-breakdown-types";

// Server-merged usage: base usage + TokenLens summary + optional modelId
export type AppUsage = LanguageModelUsage &
  UsageData & {
    modelId?: string;
    /** Approximate input-context sources, scaled to billed inputTokens. */
    breakdown?: ContextBreakdownPart[];
  };
