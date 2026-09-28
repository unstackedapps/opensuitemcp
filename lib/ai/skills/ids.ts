/**
 * Skill id vocabulary, with no server imports.
 *
 * `lib/org/custom-skills.ts` owns the org skill table and is `server-only`,
 * so the prefix lives here where the pure guardrails can read it too. Mirrors
 * `lib/ai/personas/ids.ts`.
 */

export const ORG_CUSTOM_SKILL_ID_PREFIX = "org-custom:";

export function isOrgManagedCustomSkillId(id: string): boolean {
  return id.startsWith(ORG_CUSTOM_SKILL_ID_PREFIX);
}
