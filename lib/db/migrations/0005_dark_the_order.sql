ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "maxIterationsReached" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "maxIterations" text DEFAULT '10';
