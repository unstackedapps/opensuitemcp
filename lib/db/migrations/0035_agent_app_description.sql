-- A name alone does not distinguish "Claude" on a laptop from "Claude" on a
-- phone, or one subsidiary's agent app from another's.
ALTER TABLE "McpApiKey" ADD COLUMN IF NOT EXISTS "description" varchar(256);
--> statement-breakpoint
ALTER TABLE "OAuthGrant" ADD COLUMN IF NOT EXISTS "description" varchar(256);
