-- An agent is created in the portal and may sit there waiting for a client.
-- Until one signs in there is no client id and no connection time.
ALTER TABLE "OAuthGrant" ALTER COLUMN "clientId" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "OAuthGrant" ADD COLUMN IF NOT EXISTS "connectedAt" timestamp;
--> statement-breakpoint
-- Every grant that already exists was made by a client completing the flow,
-- so it has been connected since the moment it was written.
UPDATE "OAuthGrant" SET "connectedAt" = "createdAt" WHERE "connectedAt" IS NULL;
--> statement-breakpoint
-- The consent screen no longer asks for these: the agent already carries them
-- before a client ever asks, so the code only has to name the agent.
-- Codes live 60 seconds, so nothing durable is lost by clearing the table to
-- make "grantId" mandatory. The cost is that a code issued during the deploy
-- itself cannot be redeemed, and the client retries.
DELETE FROM "OAuthAuthorizationCode";
--> statement-breakpoint
ALTER TABLE "OAuthAuthorizationCode" DROP COLUMN IF EXISTS "agentName";
--> statement-breakpoint
ALTER TABLE "OAuthAuthorizationCode" DROP COLUMN IF EXISTS "personaId";
--> statement-breakpoint
ALTER TABLE "OAuthAuthorizationCode" DROP COLUMN IF EXISTS "netsuiteAccountId";
--> statement-breakpoint
ALTER TABLE "OAuthAuthorizationCode" ALTER COLUMN "grantId" SET NOT NULL;
