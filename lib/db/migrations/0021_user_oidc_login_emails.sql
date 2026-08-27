CREATE TABLE IF NOT EXISTS "UserOidcLoginEmail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"email" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserOidcLoginEmail_email_unique" ON "UserOidcLoginEmail" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserOidcLoginEmail_userId_email_unique" ON "UserOidcLoginEmail" USING btree ("userId","email");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserOidcLoginEmail" ADD CONSTRAINT "UserOidcLoginEmail_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
