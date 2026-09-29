import type { Chat } from "@/lib/db/schema";

export type StreamOutcome = "completed" | "error";

/** A chat row as the sidebar reads it: the row plus what its streams say. */
export type ChatWithActivity = Chat & {
  isLive: boolean;
  lastOutcome: StreamOutcome | null;
};

/**
 * Four states, one per dot.
 *
 * Only states the server knows for certain reach `needsUser`. Reading intent
 * out of the last message role would call every turn that ends in a question
 * "finished", and a dot that is wrong is worse than no dot.
 */
export type ChatStatus = "working" | "needsUser" | "finished" | "idle";

export function chatStatus(chat: ChatWithActivity): ChatStatus {
  if (chat.isLive) {
    return "working";
  }

  const unviewed =
    chat.lastViewedAt === null ||
    chat.updatedAt.getTime() > chat.lastViewedAt.getTime();

  if (!unviewed) {
    return "idle";
  }

  if (chat.maxIterationsReached || chat.lastOutcome === "error") {
    return "needsUser";
  }

  return "finished";
}

export const CHAT_STATUS_LABEL: Record<ChatStatus, string> = {
  working: "Working",
  needsUser: "Needs you",
  finished: "Finished",
  idle: "",
};
