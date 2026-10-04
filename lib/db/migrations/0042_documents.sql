-- Markdown documents an agent writes and a person reads: artifacts and memories.
--
-- One table, two kinds. An artifact is output someone opens beside the
-- conversation; a memory is a fact worth recalling in a later session. They
-- differ in who reads them and when, not in how they are stored, and a second
-- table would duplicate every query and drift from the first.
--
-- "path" rather than a name, matching UserSkillFile, so a directory of markdown
-- is a real directory rather than a metaphor. Unique per user and kind, so an
-- artifact and a memory may share a path without colliding.
--
-- "chatId" is ON DELETE SET NULL. A chat going away must not take the document
-- someone kept with it.
--
-- "netsuiteAccountId" is the scope guard: a fact learned in a sandbox account is
-- not read back against production. It is the account string, not a foreign key,
-- because accounts are held in UserSettings and the org tables by that string.
--
-- "version" counts writes. It makes a stale overwrite detectable; it is not
-- history, and nothing reads an earlier version back.
CREATE TABLE IF NOT EXISTS "Document" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "kind" varchar NOT NULL,
  "path" varchar(256) NOT NULL,
  "title" varchar(200),
  "content" text NOT NULL,
  "chatId" uuid REFERENCES "Chat"("id") ON DELETE SET NULL,
  "netsuiteAccountId" varchar(128),
  "version" integer DEFAULT 1 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Document_user_kind_path_unique" ON "Document" ("userId","kind","path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Document_user_kind_updated_idx" ON "Document" ("userId","kind","updatedAt" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Document_chatId_idx" ON "Document" ("chatId");
