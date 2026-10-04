import type { ChatMessage } from "@/lib/types";

/** One memory that was read into a turn, as the turn footer names it. */
export type TurnMemory = {
  path: string;
  accountId: string | null;
};

function isTurnMemory(value: unknown): value is TurnMemory {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as { path?: unknown; accountId?: unknown };
  return (
    typeof record.path === "string" &&
    record.path.length > 0 &&
    (record.accountId === null || typeof record.accountId === "string")
  );
}

/**
 * The memories a turn was given, read back off the turn itself.
 *
 * A memory is injected before the model is called and leaves no trace in the
 * answer, so the turn carries the list with it. Knowing which account each one
 * came from is the point: a sandbox fact under a production answer is the
 * mistake worth seeing where the answer is, not in a panel afterwards.
 */
export function collectTurnMemories(
  assistantMessage: ChatMessage | undefined,
): TurnMemory[] {
  const memories = new Map<string, TurnMemory>();
  for (const part of assistantMessage?.parts ?? []) {
    if (part.type !== "data-turnMemories") {
      continue;
    }
    if (!("data" in part) || !Array.isArray(part.data)) {
      continue;
    }
    for (const item of part.data) {
      if (!isTurnMemory(item)) {
        continue;
      }
      memories.set(item.path, { path: item.path, accountId: item.accountId });
    }
  }
  return [...memories.values()];
}

/**
 * One turn can span more than one assistant message: the data parts arrive
 * before the answer starts and land in a message of their own, which is then
 * not rendered. The list it carried still belongs to the answer, so the walk
 * back covers every assistant message since the last thing a person said.
 */
export function getMemoriesForAssistantTurn(
  messages: ChatMessage[],
  assistantMessageId: string,
): TurnMemory[] {
  const index = messages.findIndex(
    (message) => message.id === assistantMessageId,
  );
  if (index < 0) {
    return [];
  }

  const memories = new Map<string, TurnMemory>();
  for (let i = index; i >= 0; i--) {
    const candidate = messages.at(i);
    if (candidate?.role !== "assistant") {
      break;
    }
    for (const memory of collectTurnMemories(candidate)) {
      memories.set(memory.path, memory);
    }
  }
  return [...memories.values()];
}
