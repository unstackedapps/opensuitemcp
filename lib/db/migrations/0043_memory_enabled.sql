-- Whether memories are read into a turn and the memory tools offered.
--
-- On by default. Nothing is written to memory unless a person asks for it, so
-- the switch starting on costs nobody a surprise; what it governs is whether
-- what is already there is read back and whether the model is offered the tools
-- at all.
--
-- Off stops the reading as well as the writing, so a memory can be silenced
-- without being deleted.
ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "memoryEnabled" boolean DEFAULT true NOT NULL;
