import type { ChatMessage } from "@/lib/types";

export type SkillChip = {
  id: string;
  name: string;
};

function isSkillChip(value: unknown): value is SkillChip {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as { id?: unknown; name?: unknown };
  return typeof record.id === "string" && typeof record.name === "string";
}

function collectChipsFromParts(
  parts: ChatMessage["parts"] | undefined,
  type: "data-turnSkills" | "data-invokedConnectedSkills",
): SkillChip[] {
  const chips = new Map<string, SkillChip>();
  for (const part of parts ?? []) {
    if (part.type !== type) {
      continue;
    }
    if (!("data" in part) || !Array.isArray(part.data)) {
      continue;
    }
    for (const item of part.data) {
      if (!isSkillChip(item) || item.id.length === 0) {
        continue;
      }
      chips.set(item.id, { id: item.id, name: item.name });
    }
  }
  return [...chips.values()];
}

export function collectInvokedSkillsFromMessage(
  userMessage: ChatMessage | undefined,
): SkillChip[] {
  return collectChipsFromParts(
    userMessage?.parts,
    "data-invokedConnectedSkills",
  );
}

export function collectRecordedTurnSkills(
  assistantMessage: ChatMessage | undefined,
): SkillChip[] {
  return collectChipsFromParts(assistantMessage?.parts, "data-turnSkills");
}

export function getSkillsForAssistantTurn(
  messages: ChatMessage[],
  assistantMessageId: string,
): SkillChip[] {
  const assistantIndex = messages.findIndex(
    (message) => message.id === assistantMessageId,
  );
  if (assistantIndex < 0) {
    return [];
  }

  const recorded = collectRecordedTurnSkills(messages.at(assistantIndex));
  if (recorded.length > 0) {
    return recorded;
  }

  if (assistantIndex === 0) {
    return [];
  }

  let userMessage: ChatMessage | undefined;
  for (let index = assistantIndex - 1; index >= 0; index--) {
    const candidate = messages.at(index);
    if (candidate?.role === "user") {
      userMessage = candidate;
      break;
    }
  }

  return collectInvokedSkillsFromMessage(userMessage);
}
