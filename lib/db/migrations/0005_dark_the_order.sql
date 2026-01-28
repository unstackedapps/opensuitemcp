ALTER TABLE "Chat" ADD COLUMN "maxIterationsReached" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN "maxIterations" text DEFAULT '10';