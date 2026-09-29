-- When an agent is working, not only when its output lands.
--
-- Only the in-app chat route writes a Stream row, so the sidebar could pulse
-- for a turn a person typed and never for an agent driving a thread over MCP —
-- the case the dot exists for. An agent's appends are the only signal it
-- leaves, so each one stamps the chat, and the chat reads as working until the
-- stamp goes stale.
--
-- A stamp rather than a second Stream row: a run over MCP has no single stream
-- to open and close, and an append is instantaneous, so a row would either
-- pulse for a millisecond or never clear.
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "agentActiveAt" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Chat_agent_active_idx" ON "Chat" ("agentActiveAt")
  WHERE "agentActiveAt" IS NOT NULL;
