CREATE TABLE IF NOT EXISTS "McpApiKey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"orgId" uuid,
	"name" varchar(128) NOT NULL,
	"tokenId" varchar(32) NOT NULL,
	"tokenHash" text NOT NULL,
	"scopes" jsonb DEFAULT '["read"]'::jsonb NOT NULL,
	"netsuiteAccountId" varchar(64),
	"lastUsedAt" timestamp,
	"expiresAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrgMcpServerPolicy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"allowWriteScope" boolean DEFAULT false NOT NULL,
	"maxKeysPerUser" integer DEFAULT 5 NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "McpApiKey" ADD CONSTRAINT "McpApiKey_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "McpApiKey" ADD CONSTRAINT "McpApiKey_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgMcpServerPolicy" ADD CONSTRAINT "OrgMcpServerPolicy_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "McpApiKey_tokenId_key" ON "McpApiKey" USING btree ("tokenId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "McpApiKey_userId_idx" ON "McpApiKey" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgMcpServerPolicy_orgId_key" ON "OrgMcpServerPolicy" USING btree ("orgId");
