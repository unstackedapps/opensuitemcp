ALTER TABLE "Org" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" timestamp;
