import type { Chat } from "@/lib/db/schema";

export type StreamOutcome = "completed" | "error";

/**
 * A chat row as the sidebar reads it: the row plus what its streams say.
 *
 * The timestamps are `Date | string` because the sidebar is fed by
 * `Response.json`, which renders a Date as an ISO string. Typing them as Date
 * and calling `.getTime()` on the result throws on every row.
 */
export type ChatWithActivity = Omit<
  Chat,
  "createdAt" | "updatedAt" | "lastViewedAt"
> & {
  createdAt: Date | string;
  updatedAt: Date | string;
  lastViewedAt: Date | string | null;
  isLive: boolean;
  lastOutcome: StreamOutcome | null;
};

function millis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Same reason as `millis`: the value is a Date on the server, a string once it
 * has been through Response.json. */
export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Four states, one per dot.
 *
 * Only states the server knows for certain reach `needsUser`. Reading intent
 * out of the last message role would call every turn that ends in a question
 * "finished", and a dot that is wrong is worse than no dot.
 */
export type ChatStatus = "working" | "needsUser" | "finished" | "idle";

/**
 * `isViewing` is the chat on screen. Its turn ends, the row reads finished and
 * unviewed for as long as the viewed mark takes to land, and the dot flashes
 * blue at someone already reading it. Nobody needs telling about a turn they
 * just watched.
 */
export function chatStatus(
  chat: ChatWithActivity,
  isViewing = false,
): ChatStatus {
  if (chat.isLive) {
    return "working";
  }

  if (isViewing) {
    return "idle";
  }

  const unviewed =
    chat.lastViewedAt === null ||
    millis(chat.updatedAt) > millis(chat.lastViewedAt);

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
