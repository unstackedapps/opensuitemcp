-- Which AI product this app is for. The consent screen uses it to pre-select
-- the app a connecting client most likely means, and the list filters on it.
--
-- Free text rather than an enum: a person may be connecting Grok, Perplexity
-- or something local, and a new product should not need a migration. Known
-- products are stored under the ids in lib/mcp/connect-clients.ts; anything
-- else is stored as the person typed it.
ALTER TABLE "McpApiKey" ADD COLUMN IF NOT EXISTS "connectsFrom" varchar(64);
--> statement-breakpoint
ALTER TABLE "OAuthGrant" ADD COLUMN IF NOT EXISTS "connectsFrom" varchar(64);
