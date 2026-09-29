-- Sidebar status: what a chat is doing, and whether the user has seen it.
--
-- Three additions, one per dot the sidebar had no source for.
--
-- Stream."finishedAt"/"outcome": Stream was id/chatId/createdAt, with nothing
-- marking a run over, so a live-stream query over it renders every chat ever run
-- as working. Existing rows are historical by definition and backfill as
-- completed; without that backfill the first deploy paints the whole sidebar grey.
-- "outcome" carries 'error' so a failed run is a yellow dot without sniffing the
-- saved message text for its "**Error:**" prefix.
--
-- Chat."updatedAt": history sorted by "createdAt", so an agent working a month-old
-- thread could not surface. Backfilled from the newest message in the chat so the
-- first sort after deploy is already right.
--
-- Chat."lastViewedAt": two of the four dots are "…and unviewed", and no read state
-- existed anywhere in the schema.
ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "finishedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "Stream" ADD COLUMN IF NOT EXISTS "outcome" varchar(16);
--> statement-breakpoint
UPDATE "Stream" SET "finishedAt" = "createdAt", "outcome" = 'completed'
  WHERE "finishedAt" IS NULL;
--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp;
--> statement-breakpoint
UPDATE "Chat" SET "updatedAt" = COALESCE(
    (SELECT MAX(m."createdAt") FROM "Message" m WHERE m."chatId" = "Chat"."id"),
    "Chat"."createdAt"
  ) WHERE "updatedAt" IS NULL;
--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "updatedAt" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "Chat" ALTER COLUMN "updatedAt" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "lastViewedAt" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Chat_user_updated_idx" ON "Chat" ("userId","updatedAt" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Stream_chat_live_idx" ON "Stream" ("chatId") WHERE "finishedAt" IS NULL;
