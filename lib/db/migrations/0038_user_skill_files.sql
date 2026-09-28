-- Reference files beside a custom skill's SKILL.md.
--
-- A table rather than another JSONB field on UserSettings: that row is read on
-- every chat turn, and a bundle's references are large and read rarely. Keeping
-- them out of the settings blob is what makes progressive disclosure real.
CREATE TABLE IF NOT EXISTS "UserSkillFile" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "skillId" varchar(128) NOT NULL,
  "path" varchar(256) NOT NULL,
  "content" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserSkillFile_user_skill_path_unique" ON "UserSkillFile" ("userId","skillId","path");
