CREATE TABLE IF NOT EXISTS "UserAgentAccess" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"orgId" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "OrgMcpServerPolicy" ADD COLUMN "memberAccess" varchar(16) DEFAULT 'all' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserAgentAccess" ADD CONSTRAINT "UserAgentAccess_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserAgentAccess" ADD CONSTRAINT "UserAgentAccess_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserAgentAccess_userId_orgId_unique" ON "UserAgentAccess" USING btree ("userId","orgId");