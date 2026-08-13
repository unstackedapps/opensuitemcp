ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "netsuiteMcpTools" jsonb DEFAULT '{}'::jsonb NOT NULL;
