CREATE TABLE IF NOT EXISTS "OAuthClient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clientId" varchar(512) NOT NULL,
	"clientSecretHash" text,
	"clientSecretCipher" text,
	"clientName" varchar(128) NOT NULL,
	"clientUri" text,
	"logoUri" text,
	"redirectUris" jsonb NOT NULL,
	"grantTypes" jsonb NOT NULL,
	"tokenEndpointAuthMethod" varchar(32) NOT NULL,
	"registrationKind" varchar(16) NOT NULL,
	"softwareId" varchar(128),
	"createdByUserId" uuid,
	"orgId" uuid,
	"metadataFetchedAt" timestamp,
	"metadataExpiresAt" timestamp,
	"lastUsedAt" timestamp,
	"disabledAt" timestamp,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OAuthAuthorizationCode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tokenId" varchar(32) NOT NULL,
	"tokenHash" text NOT NULL,
	"clientId" varchar(512) NOT NULL,
	"userId" uuid NOT NULL,
	"orgId" uuid,
	"redirectUri" text NOT NULL,
	"codeChallenge" varchar(128) NOT NULL,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"agentName" varchar(128) NOT NULL,
	"personaId" varchar(128),
	"netsuiteAccountId" varchar(64),
	"expiresAt" timestamp NOT NULL,
	"consumedAt" timestamp,
	"grantId" uuid,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OAuthGrant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"orgId" uuid,
	"clientId" varchar(512) NOT NULL,
	"name" varchar(128) NOT NULL,
	"netsuiteAccountId" varchar(64),
	"personaId" varchar(128),
	"scope" text NOT NULL,
	"lastUsedAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OAuthToken" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grantId" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"tokenId" varchar(32) NOT NULL,
	"tokenHash" text NOT NULL,
	"rotatedFromId" uuid,
	"expiresAt" timestamp NOT NULL,
	"consumedAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_grantId_OAuthGrant_id_fk" FOREIGN KEY ("grantId") REFERENCES "public"."OAuthGrant"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthClient_clientId_key" ON "OAuthClient" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OAuthClient_createdByUserId_idx" ON "OAuthClient" USING btree ("createdByUserId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAuthorizationCode_tokenId_key" ON "OAuthAuthorizationCode" USING btree ("tokenId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OAuthAuthorizationCode_expiresAt_idx" ON "OAuthAuthorizationCode" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OAuthGrant_userId_idx" ON "OAuthGrant" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OAuthGrant_clientId_idx" ON "OAuthGrant" USING btree ("clientId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthToken_tokenId_key" ON "OAuthToken" USING btree ("tokenId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OAuthToken_grantId_idx" ON "OAuthToken" USING btree ("grantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OAuthToken_expiresAt_idx" ON "OAuthToken" USING btree ("expiresAt");
