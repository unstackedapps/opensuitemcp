ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "personaId" varchar(64);--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "defaultPersonaId" varchar(64);--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "hidePersonaPicker" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "customPersonas" jsonb DEFAULT '[]'::jsonb NOT NULL;
