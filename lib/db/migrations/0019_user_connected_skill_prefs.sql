ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "disabledOrgConnectedSkillSourceIds" jsonb DEFAULT '[]'::jsonb NOT NULL;
