ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "connectedSkillSources" jsonb DEFAULT '[]'::jsonb NOT NULL;
