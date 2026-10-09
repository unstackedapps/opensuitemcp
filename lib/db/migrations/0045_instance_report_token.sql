-- The instance report's token when an admin generated it in the app, rather
-- than setting OSMCP_INSTANCE_REPORT_TOKEN on the server. Only its SHA-256 is
-- stored; the app shows the token once, when it is generated. One row at most.
CREATE TABLE IF NOT EXISTS "InstanceReportToken" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "tokenHash" varchar(64) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "createdBy" uuid REFERENCES "User"("id") ON DELETE SET NULL
);
