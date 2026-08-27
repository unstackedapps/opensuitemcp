CREATE TABLE IF NOT EXISTS "OrgSearchResource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"label" varchar(128) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"catalogId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UserSettings" ADD COLUMN "searchResources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "OrgSearchResource" ADD CONSTRAINT "OrgSearchResource_orgId_Org_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."Org"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgSearchResource_orgId_url_unique" ON "OrgSearchResource" USING btree ("orgId","url");
--> statement-breakpoint
INSERT INTO "OrgSearchResource" ("id", "orgId", "label", "url", "enabled", "catalogId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), o."id", 'Oracle NetSuite Help Center', 'https://docs.oracle.com/en/cloud/saas/netsuite', true, 'oracle-netsuite-help', NOW(), NOW()
FROM "Org" o
WHERE NOT EXISTS (
  SELECT 1 FROM "OrgSearchResource" r WHERE r."orgId" = o."id"
);