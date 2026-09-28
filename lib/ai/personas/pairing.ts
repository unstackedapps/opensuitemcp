/**
 * Skills a persona brings with it.
 *
 * A persona names the skills it works with, and adopting the persona injects
 * them for the turn even when their mode is `slash`. That is what makes
 * `slash` the right default for a skill an agent writes: the skill stays off
 * every unrelated turn, and arrives whenever the specialist who needs it does.
 *
 * Pure on purpose — the settings route, the chat route, the MCP tools and the
 * personas panel all normalize through here.
 */

/** Skills one persona may pair. Well past any real playbook, short of abuse. */
export const MAX_PAIRED_SKILL_IDS = 16;

const MAX_SKILL_ID = 128;

export function normalizePairedSkillIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const id = entry.trim();
    if (!id || id.length > MAX_SKILL_ID || seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (seen.size >= MAX_PAIRED_SKILL_IDS) {
      break;
    }
  }
  return [...seen];
}

/**
 * Pairings whose skill no longer exists are dropped rather than carried: a
 * deleted skill must not keep a persona pointing at an id nothing resolves.
 */
export function prunePairedSkillIds(
  pairedSkillIds: readonly string[],
  availableSkillIds: readonly string[],
): string[] {
  const available = new Set(availableSkillIds);
  return pairedSkillIds.filter((id) => available.has(id));
}
