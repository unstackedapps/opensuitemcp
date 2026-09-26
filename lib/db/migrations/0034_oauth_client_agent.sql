-- A hand-made OAuth client belongs to the agent it was issued for, and may
-- connect that agent only. Null for clients that registered themselves.
ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "grantId" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OAuthClient"
    ADD CONSTRAINT "OAuthClient_grantId_OAuthGrant_id_fk"
    FOREIGN KEY ("grantId") REFERENCES "OAuthGrant"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OAuthClient_grantId_idx" ON "OAuthClient" ("grantId");
