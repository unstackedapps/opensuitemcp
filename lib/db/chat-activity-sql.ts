import { getTableColumns, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import type { StreamOutcome } from "@/lib/chat-status";
import { chat } from "./schema";

/**
 * How long a stream with no `finishedAt` is still believed to be running. A
 * killed process never reaches onFinish or onError, so without a cutoff its
 * chat would pulse gray forever.
 */
export const STREAM_STALE_MS = 15 * 60 * 1000;

/**
 * How long after its last append an agent still counts as working. An agent
 * appends as it goes, so each step renews the stamp; when it stops, the dot
 * clears within this window rather than hanging on a run that already ended.
 */
export const AGENT_ACTIVE_MS = 90 * 1000;

/**
 * Both fragments name `"Chat"."id"` in full rather than interpolating the
 * column. Drizzle renders an interpolated `chat.id` as a bare `"id"`, which
 * inside these subqueries binds to `"Stream"."id"` — the correlation then
 * compares a stream to itself, every row reads false, and nothing errors.
 */
export const isLiveSql = sql<boolean>`(
  EXISTS (
    SELECT 1 FROM "Stream" s
    WHERE s."chatId" = "Chat"."id"
      AND s."finishedAt" IS NULL
      AND s."createdAt" > now() - make_interval(secs => ${STREAM_STALE_MS / 1000})
  )
  OR COALESCE(
    "Chat"."agentActiveAt" > now() - make_interval(secs => ${AGENT_ACTIVE_MS / 1000}),
    false
  )
)`;

export const lastOutcomeSql = sql<StreamOutcome | null>`(
  SELECT s."outcome" FROM "Stream" s
  WHERE s."chatId" = "Chat"."id"
  ORDER BY s."createdAt" DESC
  LIMIT 1
)`;

/**
 * The activity columns as `getChatsByUserId` selects them. Exported so a test
 * can render the real select context: drizzle strips a table qualifier from an
 * interpolated column inside a select, and standalone rendering does not, so a
 * fragment checked on its own proves nothing.
 */
export function chatActivityQuery() {
  return new QueryBuilder()
    .select({
      ...getTableColumns(chat),
      isLive: isLiveSql.as("isLive"),
      lastOutcome: lastOutcomeSql.as("lastOutcome"),
    })
    .from(chat);
}
