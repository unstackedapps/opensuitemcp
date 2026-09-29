-- Named groups in the sidebar, replacing the Today/Yesterday/Older buckets.
--
-- "position" rather than ordering by name: the order is the user's, and a group
-- renamed from " Z" to "A" should not jump.
--
-- "collapsed" lives on the row because a group belongs to one user already, so
-- there is no second place for the state to go.
--
-- Chat."groupId" is ON DELETE SET NULL. Deleting a group unfiles its chats; it
-- must never take them with it.
CREATE TABLE IF NOT EXISTS "ChatGroup" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "name" varchar(80) NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "collapsed" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ChatGroup_user_position_idx" ON "ChatGroup" ("userId","position");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ChatGroup_user_name_unique" ON "ChatGroup" ("userId", lower("name"));
--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "groupId" uuid
  REFERENCES "ChatGroup"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Chat_group_updated_idx" ON "Chat" ("groupId","updatedAt" DESC);
