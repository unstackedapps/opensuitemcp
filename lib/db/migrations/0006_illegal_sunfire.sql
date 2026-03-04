ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "inceptionApiKey" text;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "customInstructions" text;
