export type SkillInvocationMode = "auto" | "slash" | "off";

export type SkillKind = "oracle" | "community" | "custom" | "connected";

export type SkillModesMap = Record<string, SkillInvocationMode>;

export function isSkillInvocationMode(
  value: unknown,
): value is SkillInvocationMode {
  return value === "auto" || value === "slash" || value === "off";
}

export function normalizeSkillModes(raw: unknown): SkillModesMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const modes: SkillModesMap = {};
  for (const [skillId, mode] of Object.entries(raw)) {
    if (typeof skillId !== "string" || skillId.length === 0) {
      continue;
    }
    if (isSkillInvocationMode(mode)) {
      modes[skillId] = mode;
    }
  }
  return modes;
}

/** Folder-safe slash token from a skill name. */
export function slugifySkillName(name: string, fallback = "skill"): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function resolveSkillMode(params: {
  skillId: string;
  kind: SkillKind;
  alwaysOn?: boolean;
  skillModes: SkillModesMap;
  enabledSkillIds: string[];
  customEnabled?: boolean;
}): SkillInvocationMode {
  if (params.alwaysOn) {
    return "auto";
  }

  const stored = params.skillModes[params.skillId];

  if (params.kind === "connected") {
    return stored ?? "slash";
  }

  if (params.kind === "custom") {
    if (stored) {
      return stored;
    }
    return params.customEnabled === false ? "off" : "auto";
  }

  // Oracle / community: Auto stays in enabledSkillIds so org overlay can strip it.
  if (stored === "slash" || stored === "off") {
    return stored;
  }
  return params.enabledSkillIds.includes(params.skillId) ? "auto" : "off";
}

export function isSlashableMode(mode: SkillInvocationMode): boolean {
  return mode === "auto" || mode === "slash";
}

export function shouldInjectSkillForTurn(
  mode: SkillInvocationMode,
  skillId: string,
  invokedSkillIds: readonly string[],
): boolean {
  if (mode === "auto") {
    return true;
  }
  if (mode === "slash") {
    return invokedSkillIds.includes(skillId);
  }
  return false;
}

export function applySkillModeChange<
  T extends { id: string; enabled?: boolean },
>(params: {
  skillId: string;
  kind: SkillKind;
  mode: SkillInvocationMode;
  skillModes: SkillModesMap;
  enabledSkillIds: string[];
  customSkills: T[];
}): {
  skillModes: SkillModesMap;
  enabledSkillIds: string[];
  customSkills: T[];
} {
  const skillModes = {
    ...params.skillModes,
    [params.skillId]: params.mode,
  };

  let enabledSkillIds = params.enabledSkillIds;
  if (params.kind === "oracle" || params.kind === "community") {
    const without = params.enabledSkillIds.filter(
      (id) => id !== params.skillId,
    );
    enabledSkillIds =
      params.mode === "auto" ? [...without, params.skillId] : without;
  }

  const customSkills =
    params.kind === "custom"
      ? params.customSkills.map((skill) =>
          skill.id === params.skillId
            ? { ...skill, enabled: params.mode === "auto" }
            : skill,
        )
      : params.customSkills;

  return { skillModes, enabledSkillIds, customSkills };
}
