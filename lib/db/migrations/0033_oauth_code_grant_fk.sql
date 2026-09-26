-- OAuthAuthorizationCode.grantId became mandatory in 0032 but never got the
-- foreign key its siblings have, so a code could name a grant that does not
-- exist. Codes live sixty seconds, so any row present now is already spent or
-- expired and clearing them is cheaper than validating them.
DELETE FROM "OAuthAuthorizationCode" WHERE "consumedAt" IS NOT NULL OR "expiresAt" <= now();
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OAuthAuthorizationCode"
    ADD CONSTRAINT "OAuthAuthorizationCode_grantId_OAuthGrant_id_fk"
    FOREIGN KEY ("grantId") REFERENCES "OAuthGrant"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
