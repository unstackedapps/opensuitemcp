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

/** Reference files one skill may carry beside its SKILL.md. */
export const MAX_SKILL_FILES = 32;

/**
 * One reference path.
 *
 * Rejected rather than sanitised: `..` and absolute paths are how a bundle
 * would reach outside its own folder, and a silently rewritten path would
 * break the link SKILL.md wrote.
 */
export function normalizeSkillFilePath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const path = value.trim().replace(/^\.\//, "");
  if (!path || path.length > 256) {
    return null;
  }
  if (path.startsWith("/") || path.includes("\\")) {
    return null;
  }
  if (path.split("/").some((part) => part === "." || part === "..")) {
    return null;
  }
  if (path.toUpperCase() === "SKILL.MD") {
    return null;
  }
  return path;
}
