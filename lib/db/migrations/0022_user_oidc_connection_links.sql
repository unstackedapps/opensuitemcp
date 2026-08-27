CREATE TABLE IF NOT EXISTS "UserOidcConnectionLink" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"orgOidcAccountId" uuid NOT NULL,
	"email" varchar(64) NOT NULL,
	"verifiedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserOidcConnectionLink_userId_orgOidcAccountId_unique" ON "UserOidcConnectionLink" USING btree ("userId","orgOidcAccountId");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserOidcConnectionLink" ADD CONSTRAINT "UserOidcConnectionLink_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserOidcConnectionLink" ADD CONSTRAINT "UserOidcConnectionLink_orgOidcAccountId_OrgNetSuiteAccount_id_fk" FOREIGN KEY ("orgOidcAccountId") REFERENCES "public"."OrgNetSuiteAccount"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
