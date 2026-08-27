CREATE TABLE IF NOT EXISTS "AuditLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"actorUserId" uuid,
	"action" varchar(64) NOT NULL,
	"targetType" varchar(64) NOT NULL,
	"targetId" varchar(128),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Org" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrgConnectedSkillSource" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"orgId" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"owner" varchar(128) NOT NULL,
	"repo" varchar(128) NOT NULL,
	"ref" varchar(128) NOT NULL,
	"path" varchar(512) DEFAULT '' NOT NULL,
	"label" varchar(512) NOT NULL,
	"lastSyncedAt" timestamp NOT NULL,
	"skillCount" integer DEFAULT 0 NOT NULL,
	"lastError" varchar(512),
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrgCustomSkill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"content" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrgLlmProvider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"apiKeyEncrypted" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"modeConfig" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrgNetSuiteAccount" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"accountId" varchar(64) NOT NULL,
	"oauthClientId" varchar(128),
	"redirectUri" varchar(512),
	"name" varchar(128) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrgNetSuiteMcpAccount" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"accountId" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"oauthClientId" varchar(128),
	"enabled" boolean DEFAULT true NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"integrationStatus" varchar(32) DEFAULT 'unknown' NOT NULL,
	"integrationVerifiedAt" timestamp,
	"integrationError" varchar(512),
	"mcpDisabledToolNames" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrgPersona" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"personaRef" varchar(128) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrgSkill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"skillRef" varchar(128) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserLlmKey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"providerId" uuid NOT NULL,
	"apiKeyEncrypted" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserLlmProviderAccess" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"providerId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserNetSuiteAccess" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"netsuiteAccountId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserNetSuiteMcpAccess" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"netsuiteMcpAccountId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserPersonaAccess" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"orgPersonaId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserRole" (
	"userId" uuid NOT NULL,
	"orgId" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	CONSTRAINT "UserRole_userId_orgId_pk" PRIMARY KEY("userId","orgId")
);
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "name" varchar(128);--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "status" varchar(16) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "mustResetPassword" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgConnectedSkillSource" ADD CONSTRAINT "OrgConnectedSkillSource_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgCustomSkill" ADD CONSTRAINT "OrgCustomSkill_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgLlmProvider" ADD CONSTRAINT "OrgLlmProvider_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgNetSuiteAccount" ADD CONSTRAINT "OrgNetSuiteAccount_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgNetSuiteMcpAccount" ADD CONSTRAINT "OrgNetSuiteMcpAccount_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgPersona" ADD CONSTRAINT "OrgPersona_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgSkill" ADD CONSTRAINT "OrgSkill_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserLlmKey" ADD CONSTRAINT "UserLlmKey_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserLlmKey" ADD CONSTRAINT "UserLlmKey_providerId_OrgLlmProvider_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."OrgLlmProvider"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserLlmProviderAccess" ADD CONSTRAINT "UserLlmProviderAccess_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserLlmProviderAccess" ADD CONSTRAINT "UserLlmProviderAccess_providerId_OrgLlmProvider_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."OrgLlmProvider"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserNetSuiteAccess" ADD CONSTRAINT "UserNetSuiteAccess_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserNetSuiteAccess" ADD CONSTRAINT "UserNetSuiteAccess_netsuiteAccountId_OrgNetSuiteAccount_id_fk" FOREIGN KEY ("netsuiteAccountId") REFERENCES "public"."OrgNetSuiteAccount"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserNetSuiteMcpAccess" ADD CONSTRAINT "UserNetSuiteMcpAccess_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserNetSuiteMcpAccess" ADD CONSTRAINT "UserNetSuiteMcpAccess_mcpAccountId_OrgNetSuiteMcpAccount_id_fk" FOREIGN KEY ("netsuiteMcpAccountId") REFERENCES "public"."OrgNetSuiteMcpAccount"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserPersonaAccess" ADD CONSTRAINT "UserPersonaAccess_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserPersonaAccess" ADD CONSTRAINT "UserPersonaAccess_orgPersonaId_OrgPersona_id_fk" FOREIGN KEY ("orgPersonaId") REFERENCES "public"."OrgPersona"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgNetSuiteAccount_orgId_accountId_unique" ON "OrgNetSuiteAccount" USING btree ("orgId","accountId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgNetSuiteMcpAccount_orgId_accountId_unique" ON "OrgNetSuiteMcpAccount" USING btree ("orgId","accountId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgPersona_orgId_personaRef_unique" ON "OrgPersona" USING btree ("orgId","personaRef");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgSkill_orgId_skillRef_unique" ON "OrgSkill" USING btree ("orgId","skillRef");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserLlmKey_userId_providerId_unique" ON "UserLlmKey" USING btree ("userId","providerId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserLlmProviderAccess_userId_providerId_unique" ON "UserLlmProviderAccess" USING btree ("userId","providerId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserNetSuiteAccess_userId_netsuiteAccountId_unique" ON "UserNetSuiteAccess" USING btree ("userId","netsuiteAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserNetSuiteMcpAccess_userId_netsuiteMcpAccountId_unique" ON "UserNetSuiteMcpAccess" USING btree ("userId","netsuiteMcpAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserPersonaAccess_userId_orgPersonaId_unique" ON "UserPersonaAccess" USING btree ("userId","orgPersonaId");