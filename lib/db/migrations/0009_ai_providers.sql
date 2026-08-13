ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "aiProviders" jsonb DEFAULT '{"defaultId":null,"providers":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "aiProviderId" varchar(64);
