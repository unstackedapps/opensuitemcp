/**
 * Skills a persona carries into a turn.
 *
 * Stored as one map keyed by persona id, beside the personas rather than on
 * them. A builtin persona is a prompt file on disk with nowhere to hold a
 * field, and pairing one is this user's own setting — so the map covers
 * builtin and custom alike, and every read site does the same lookup.
 *
 * Adopting a persona injects its paired skills even when their mode is
 * `slash`. That is what makes `slash` the right default for a skill an agent
 * writes: the skill stays off every unrelated turn and arrives whenever the
 * specialist who needs it does.
 *
 * Pure on purpose — the settings route, the chat route, the MCP tools and the
 * personas panel all normalize through here.
 */

/** Skills one persona may carry. Well past any real playbook, short of abuse. */
export const MAX_PAIRED_SKILL_IDS = 16;

/** Personas that may hold a pairing: 32 custom, the builtins, and headroom. */
const MAX_PAIRED_PERSONAS = 64;

const MAX_ID_LENGTH = 128;

export type PersonaSkillIds = Record<string, string[]>;

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
    if (!id || id.length > MAX_ID_LENGTH || seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (seen.size >= MAX_PAIRED_SKILL_IDS) {
      break;
    }
  }
  return [...seen];
}

export function normalizePersonaSkillIds(raw: unknown): PersonaSkillIds {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: PersonaSkillIds = {};
  let kept = 0;
  for (const [personaId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (kept >= MAX_PAIRED_PERSONAS) {
      break;
    }
    const id = personaId.trim();
    if (!id || id.length > MAX_ID_LENGTH) {
      continue;
    }
    const skillIds = normalizePairedSkillIds(value);
    // A persona carrying nothing is stored as absent, so "has pairings" and
    // "has an empty list" cannot disagree.
    if (skillIds.length === 0) {
      continue;
    }
    out[id] = skillIds;
    kept += 1;
  }
  return out;
}

export function pairedSkillIdsFor(
  map: PersonaSkillIds,
  personaId: string | null | undefined,
): string[] {
  if (!personaId) {
    return [];
  }
  return map[personaId] ?? [];
}

export function setPairedSkillIds(
  map: PersonaSkillIds,
  personaId: string,
  skillIds: readonly string[],
): PersonaSkillIds {
  const next = { ...map };
  const normalized = normalizePairedSkillIds([...skillIds]);
  if (normalized.length === 0) {
    delete next[personaId];
    return next;
  }
  next[personaId] = normalized;
  return next;
}

/** A deleted persona takes its pairings with it; the skills themselves stay. */
export function removePersonaPairings(
  map: PersonaSkillIds,
  personaId: string,
): PersonaSkillIds {
  const next = { ...map };
  delete next[personaId];
  return next;
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

export function prunePersonaSkillIds(
  map: PersonaSkillIds,
  availableSkillIds: readonly string[],
): PersonaSkillIds {
  const available = new Set(availableSkillIds);
  const out: PersonaSkillIds = {};
  for (const [personaId, skillIds] of Object.entries(map)) {
    const kept = skillIds.filter((id) => available.has(id));
    if (kept.length > 0) {
      out[personaId] = kept;
    }
  }
  return out;
}

/** Which personas carry this skill — the reverse view the panels render. */
export function personasCarryingSkill(
  map: PersonaSkillIds,
  skillId: string,
): string[] {
  return Object.entries(map)
    .filter(([, skillIds]) => skillIds.includes(skillId))
    .map(([personaId]) => personaId);
}

/** Detach one skill from every persona carrying it. */
export function detachSkillEverywhere(
  map: PersonaSkillIds,
  skillId: string,
): PersonaSkillIds {
  const out: PersonaSkillIds = {};
  for (const [personaId, skillIds] of Object.entries(map)) {
    const kept = skillIds.filter((id) => id !== skillId);
    if (kept.length > 0) {
      out[personaId] = kept;
    }
  }
  return out;
}
