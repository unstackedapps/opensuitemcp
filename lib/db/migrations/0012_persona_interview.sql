ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "refiningPersonaId" varchar(64);--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "personaInterview" jsonb;
