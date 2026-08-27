CREATE TABLE IF NOT EXISTS "OrgUserTag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"nameNormalized" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgUserTag_orgId_nameNormalized_unique" ON "OrgUserTag" USING btree ("orgId","nameNormalized");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgUserTag" ADD CONSTRAINT "OrgUserTag_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserOrgTag" (
	"userId" uuid NOT NULL,
	"tagId" uuid NOT NULL,
	CONSTRAINT "UserOrgTag_userId_tagId_pk" PRIMARY KEY("userId","tagId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserOrgTag" ADD CONSTRAINT "UserOrgTag_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserOrgTag" ADD CONSTRAINT "UserOrgTag_tagId_OrgUserTag_id_fk" FOREIGN KEY ("tagId") REFERENCES "public"."OrgUserTag"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
