INSERT INTO "Org" ("id", "name", "createdAt")
SELECT gen_random_uuid(), 'Default Organization', NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Org");--> statement-breakpoint
INSERT INTO "UserRole" ("userId", "orgId", "role")
SELECT u."id", o."id", 'member'
FROM "User" u
CROSS JOIN (SELECT "id" FROM "Org" LIMIT 1) o
WHERE NOT EXISTS (
  SELECT 1 FROM "UserRole" ur
  WHERE ur."userId" = u."id" AND ur."orgId" = o."id"
);--> statement-breakpoint
INSERT INTO "OrgLlmProvider" ("id", "orgId", "provider", "apiKeyEncrypted", "enabled", "locked", "modeConfig")
SELECT gen_random_uuid(), o."id", 'google', NULL, true, false, '{}'::jsonb
FROM (SELECT "id" FROM "Org" LIMIT 1) o
WHERE EXISTS (
  SELECT 1 FROM "UserSettings" us
  WHERE us."googleApiKey" IS NOT NULL AND us."googleApiKey" <> ''
    OR us."aiProvider" = 'google'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(us."aiProviders"->'providers') p
      WHERE p->>'type' = 'google'
    )
)
AND NOT EXISTS (
  SELECT 1 FROM "OrgLlmProvider" ol
  WHERE ol."orgId" = o."id" AND ol."provider" = 'google'
);--> statement-breakpoint
INSERT INTO "OrgLlmProvider" ("id", "orgId", "provider", "apiKeyEncrypted", "enabled", "locked", "modeConfig")
SELECT gen_random_uuid(), o."id", 'anthropic', NULL, true, false, '{}'::jsonb
FROM (SELECT "id" FROM "Org" LIMIT 1) o
WHERE EXISTS (
  SELECT 1 FROM "UserSettings" us
  WHERE us."anthropicApiKey" IS NOT NULL AND us."anthropicApiKey" <> ''
    OR us."aiProvider" = 'anthropic'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(us."aiProviders"->'providers') p
      WHERE p->>'type' = 'anthropic'
    )
)
AND NOT EXISTS (
  SELECT 1 FROM "OrgLlmProvider" ol
  WHERE ol."orgId" = o."id" AND ol."provider" = 'anthropic'
);--> statement-breakpoint
INSERT INTO "OrgLlmProvider" ("id", "orgId", "provider", "apiKeyEncrypted", "enabled", "locked", "modeConfig")
SELECT gen_random_uuid(), o."id", 'openai', NULL, true, false, '{}'::jsonb
FROM (SELECT "id" FROM "Org" LIMIT 1) o
WHERE EXISTS (
  SELECT 1 FROM "UserSettings" us
  WHERE us."openaiApiKey" IS NOT NULL AND us."openaiApiKey" <> ''
    OR us."aiProvider" = 'openai'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(us."aiProviders"->'providers') p
      WHERE p->>'type' = 'openai'
    )
)
AND NOT EXISTS (
  SELECT 1 FROM "OrgLlmProvider" ol
  WHERE ol."orgId" = o."id" AND ol."provider" = 'openai'
);--> statement-breakpoint
INSERT INTO "OrgNetSuiteAccount" ("id", "orgId", "accountId", "oauthClientId", "redirectUri", "name", "enabled", "locked")
SELECT gen_random_uuid(), o."id", accounts."accountId", accounts."oauthClientId", NULL, accounts."name", true, false
FROM (
  SELECT DISTINCT ON (lower(replace(elem->>'accountId', '_', '-')))
    lower(replace(elem->>'accountId', '_', '-')) AS "accountId",
    elem->>'clientId' AS "oauthClientId",
    COALESCE(elem->>'label', elem->>'accountId') AS "name"
  FROM "UserSettings" us,
    jsonb_array_elements(us."netsuiteAccounts") AS elem
  WHERE elem->>'accountId' IS NOT NULL
    AND elem->>'accountId' <> ''
  ORDER BY lower(replace(elem->>'accountId', '_', '-'))
) accounts
CROSS JOIN (SELECT "id" FROM "Org" LIMIT 1) o
WHERE NOT EXISTS (
  SELECT 1 FROM "OrgNetSuiteAccount" ona
  WHERE ona."orgId" = o."id" AND ona."accountId" = accounts."accountId"
);--> statement-breakpoint
INSERT INTO "OrgSkill" ("id", "orgId", "skillRef", "enabled", "locked")
SELECT gen_random_uuid(), o."id", skills."skillRef", true, false
FROM (
  SELECT DISTINCT jsonb_array_elements_text(us."enabledSkillIds") AS "skillRef"
  FROM "UserSettings" us
  WHERE jsonb_array_length(us."enabledSkillIds") > 0
) skills
CROSS JOIN (SELECT "id" FROM "Org" LIMIT 1) o
WHERE skills."skillRef" IS NOT NULL
  AND skills."skillRef" <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "OrgSkill" os
    WHERE os."orgId" = o."id" AND os."skillRef" = skills."skillRef"
  );--> statement-breakpoint
INSERT INTO "UserNetSuiteAccess" ("id", "userId", "netsuiteAccountId")
SELECT gen_random_uuid(), us."userId", ona."id"
FROM "UserSettings" us
JOIN jsonb_array_elements(us."netsuiteAccounts") AS elem ON true
JOIN "OrgNetSuiteAccount" ona ON ona."accountId" = lower(replace(elem->>'accountId', '_', '-'))
WHERE elem->>'accountId' IS NOT NULL
  AND elem->>'accountId' <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "UserNetSuiteAccess" una
    WHERE una."userId" = us."userId" AND una."netsuiteAccountId" = ona."id"
  );--> statement-breakpoint
INSERT INTO "UserLlmProviderAccess" ("userId", "providerId")
SELECT ur."userId", op."id"
FROM "UserRole" ur
INNER JOIN "OrgLlmProvider" op ON op."orgId" = ur."orgId"
WHERE op."enabled" = true
ON CONFLICT ("userId", "providerId") DO NOTHING;
