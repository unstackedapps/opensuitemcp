-- Skills a persona carries into a chat turn, keyed by persona id.
--
-- Kept beside customPersonas rather than inside them: a builtin persona is a
-- prompt file on disk with nowhere to hold a field, and pairing one is this
-- user's own setting. One map means one lookup for every persona, builtin or
-- custom, and no second shape to coalesce at each read site.
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "personaSkillIds" jsonb DEFAULT '{}'::jsonb NOT NULL;
