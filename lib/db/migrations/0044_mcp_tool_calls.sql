-- Tool calls agent apps make over MCP, totalled per hour.
--
-- One row per user, agent app and tool in each hour rather than one per call,
-- so a busy agent adds rows by the hour, not by the call. "hour" is the start
-- of the hour in UTC. An hour stops changing once the clock passes it, so a
-- reader that counts only past hours counts each one once.
--
-- "credentialId" is McpApiKey.id or OAuthGrant.id, told apart by
-- "credentialKind". It has no foreign key because it can be either. The rows go
-- when their user does.
CREATE TABLE IF NOT EXISTS "McpToolCallHourly" (
  "hour" timestamp NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "credentialKind" varchar(8) NOT NULL,
  "credentialId" uuid NOT NULL,
  "tool" varchar(128) NOT NULL,
  "calls" integer DEFAULT 0 NOT NULL,
  "errors" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "McpToolCallHourly_pk" PRIMARY KEY ("hour","userId","credentialKind","credentialId","tool")
);
