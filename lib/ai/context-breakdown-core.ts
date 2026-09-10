import { countTokens } from "gpt-tokenizer";
import type {
  ContextBreakdownId,
  ContextBreakdownPart,
  ContextBreakdownPartsInput,
} from "./context-breakdown-types";

export type {
  ContextBreakdownId,
  ContextBreakdownPart,
  ContextBreakdownPartsInput,
} from "./context-breakdown-types";

const LABELS: Record<ContextBreakdownId, string> = {
  system: "System prompt",
  persona: "Persona",
  skills: "Skills",
  knowledge: "Knowledge",
  tools: "Tools",
  conversation: "Conversation",
};

const ALL_IDS = [
  "system",
  "persona",
  "skills",
  "knowledge",
  "tools",
  "conversation",
] as const satisfies readonly ContextBreakdownId[];

/**
 * Count tokens with a local BPE tokenizer (o200k_base).
 * Exact for modern OpenAI models; strong approximation for other providers.
 * Falls back to chars/4 if tokenization fails.
 */
export function estimateTokensFromText(text: string): number {
  if (!text) {
    return 0;
  }
  try {
    return countTokens(text);
  } catch {
    return Math.ceil(text.length / 4);
  }
}

function part(id: ContextBreakdownId, tokens: number): ContextBreakdownPart {
  return { id, label: LABELS[id], tokens };
}

/**
 * Allocate billed `inputTokens` across buckets by tokenizer weight.
 *
 * Each part is tokenized with BPE; those counts are treated as relative
 * weights, then scaled so the displayed totals sum exactly to the provider's
 * billed input.
 */
export function estimateContextBreakdown({
  inputTokens,
  parts,
}: {
  inputTokens: number;
  parts: ContextBreakdownPartsInput;
}): ContextBreakdownPart[] {
  const target = Math.max(0, Math.floor(inputTokens));
  if (target === 0) {
    return [];
  }

  const raw: Record<ContextBreakdownId, number> = {
    system: estimateTokensFromText(parts.system ?? ""),
    persona: estimateTokensFromText(parts.persona ?? ""),
    skills: estimateTokensFromText(parts.skills ?? ""),
    knowledge: estimateTokensFromText(parts.knowledge ?? ""),
    tools: estimateTokensFromText(parts.tools ?? ""),
    conversation: estimateTokensFromText(parts.conversation ?? ""),
  };

  const weightSum = ALL_IDS.reduce((sum, id) => sum + raw[id], 0);

  if (weightSum === 0) {
    return [part("conversation", target)];
  }

  const scaled: Record<ContextBreakdownId, number> = {
    system: 0,
    persona: 0,
    skills: 0,
    knowledge: 0,
    tools: 0,
    conversation: 0,
  };

  let allocated = 0;
  for (const id of ALL_IDS) {
    const value = Math.floor((raw[id] / weightSum) * target);
    scaled[id] = value;
    allocated += value;
  }

  const remainder = target - allocated;
  if (remainder > 0) {
    let largestId: ContextBreakdownId = "conversation";
    for (const id of ALL_IDS) {
      if (raw[id] > raw[largestId]) {
        largestId = id;
      }
    }
    scaled[largestId] += remainder;
  }

  const result: ContextBreakdownPart[] = [];
  for (const id of ALL_IDS) {
    if (scaled[id] > 0) {
      result.push(part(id, scaled[id]));
    }
  }
  return result;
}

/**
 * Serialize tool definitions for size estimation (name, description, schema only).
 */
export function serializeToolsForBreakdown(
  tools: Record<
    string,
    {
      description?: string;
      parameters?: unknown;
      inputSchema?: unknown;
    }
  >,
): string {
  const entries = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description ?? "",
    schema: tool.inputSchema ?? tool.parameters ?? null,
  }));
  try {
    return JSON.stringify(entries);
  } catch {
    return entries
      .map((entry) => `${entry.name}:${entry.description}`)
      .join("\n");
  }
}

/**
 * Serialize model messages for conversation weight (roles + content only).
 */
export function serializeConversationForBreakdown(
  messages: Array<{ role?: string; content?: unknown }>,
): string {
  try {
    return JSON.stringify(
      messages.map((message) => ({
        role: message.role ?? "",
        content: message.content ?? "",
      })),
    );
  } catch {
    return messages
      .map(
        (message) => `${message.role ?? ""}:${String(message.content ?? "")}`,
      )
      .join("\n");
  }
}
