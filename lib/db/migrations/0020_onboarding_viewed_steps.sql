ALTER TABLE "Org" ADD COLUMN IF NOT EXISTS "onboardingViewedSteps" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingViewedSteps" jsonb DEFAULT '[]'::jsonb NOT NULL;
