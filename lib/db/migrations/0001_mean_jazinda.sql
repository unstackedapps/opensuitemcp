ALTER TABLE "UserSettings" ADD COLUMN "anthropicApiKey" text;--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN "aiProvider" varchar(20) DEFAULT 'google';