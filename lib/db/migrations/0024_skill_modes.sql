ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "skillModes" jsonb DEFAULT '{}'::jsonb NOT NULL;
