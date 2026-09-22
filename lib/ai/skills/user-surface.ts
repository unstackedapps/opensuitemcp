import "server-only";

import {
  getCommunitySkillContent,
  getConnectedSkillContent,
  getOracleSkillContent,
  listCommunityCatalogSkills,
  listConnectedCatalogSkills,
  listOracleCatalogSkills,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import {
  listEnabledOrgConnectedSkillSources,
  resolveConnectedSkillsScopeId,
} from "@/lib/org/connected-skills";
import {
  buildOrgAwareSkillSettings,
  getOrgFilteredSkillCatalog,
  normalizeDisabledOrgConnectedSkillSourceIds,
} from "@/lib/org/enforcement";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { resolveSkillMode, type SkillInvocationMode } from "./modes";

export type ResolvedUserSkill = {
  id: string;
  name: string;
  description: string;
  /** `builtin` exists in the catalog type but nothing emits it. */
  source: "oracle" | "community" | "connected" | "custom";
  mode: SkillInvocationMode;
  slug: string | null;
  /** Connected only: which connection the skill came from. */
  sourceId: string | null;
};

type SettingsRow = Parameters<typeof normalizeUserSkillSettings>[0];

/**
 * Every skill a user actually has, from all four sources, each carrying the
 * invocation mode that decides whether it applies.
 *
 * `app/api/skills/route.ts` assembles the same surface for the settings UI and
 * returns a wider, UI-shaped payload. This is the flat form; keep the two in
 * step, because a caller that hand-rolls the assembly silently misses whichever
 * source it forgot.
 */
export async function resolveUserSkillSurface(params: {
  userId: string;
  orgId: string | null;
  settings: SettingsRow;
  /** Org-managed connected sources the user turned off for themselves. */
  disabledOrgConnectedSkillSourceIds?: unknown;
}): Promise<ResolvedUserSkill[]> {
  const userSkillSettings = normalizeUserSkillSettings(params.settings);
  const orgManaged = isOrgInstallMode() && Boolean(params.orgId);

  let { enabledSkillIds, customSkills, connectedSkillSources } =
    userSkillSettings;
  const disabledConnectedSourceIds =
    normalizeDisabledOrgConnectedSkillSourceIds(
      params.disabledOrgConnectedSkillSourceIds,
    );

  if (orgManaged && params.orgId) {
    const merged = await buildOrgAwareSkillSettings({
      orgId: params.orgId,
      enabledSkillIds,
      customSkills,
      connectedSkillSources,
      disabledOrgConnectedSkillSourceIds: disabledConnectedSourceIds,
    });
    enabledSkillIds = merged.enabledSkillIds;
    customSkills = merged.customSkills;
    connectedSkillSources = await listEnabledOrgConnectedSkillSources(
      params.orgId,
    );
  }

  const catalog =
    orgManaged && params.orgId
      ? await getOrgFilteredSkillCatalog(params.orgId)
      : [...listOracleCatalogSkills(), ...listCommunityCatalogSkills()];

  const connectedSkills = listConnectedCatalogSkills(
    resolveConnectedSkillsScopeId(params.userId, params.orgId),
    connectedSkillSources.filter(
      (source) => !disabledConnectedSourceIds.includes(source.id),
    ),
  );

  const resolved: ResolvedUserSkill[] = [];

  for (const skill of [...catalog, ...connectedSkills]) {
    const kind = skill.source;
    // `builtin` is declared in CatalogSkill but never emitted; skip defensively
    // rather than resolve a mode for a kind resolveSkillMode does not know.
    if (kind === "builtin" || kind === "custom") {
      continue;
    }
    resolved.push({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      source: kind,
      mode: resolveSkillMode({
        skillId: skill.id,
        kind,
        alwaysOn: skill.alwaysOn,
        skillModes: userSkillSettings.skillModes,
        enabledSkillIds,
      }),
      slug: skill.slug ?? null,
      sourceId: skill.sourceId ?? null,
    });
  }

  for (const skill of customSkills) {
    resolved.push({
      id: skill.id,
      name: skill.name,
      description: "Custom skill",
      source: "custom",
      mode: resolveSkillMode({
        skillId: skill.id,
        kind: "custom",
        skillModes: userSkillSettings.skillModes,
        enabledSkillIds,
        customEnabled: skill.enabled,
      }),
      slug: skill.slug ?? null,
      sourceId: null,
    });
  }

  return resolved;
}

/**
 * The body of one skill, or null when the user has no such skill or has
 * switched it off. Off is reported the same as missing on purpose: a caller
 * should not be able to read a skill it cannot see in the listing.
 */
export async function readUserSkillContent(params: {
  userId: string;
  orgId: string | null;
  settings: SettingsRow;
  skillId: string;
  disabledOrgConnectedSkillSourceIds?: unknown;
}): Promise<{ skill: ResolvedUserSkill; content: string } | null> {
  const surface = await resolveUserSkillSurface(params);
  const skill = surface.find(
    (entry) => entry.id === params.skillId && entry.mode !== "off",
  );
  if (!skill) {
    return null;
  }

  let content: string | null = null;
  switch (skill.source) {
    case "oracle":
      content = getOracleSkillContent(skill.id);
      break;
    case "community":
      content = getCommunitySkillContent(skill.id);
      break;
    case "connected":
      content = getConnectedSkillContent(
        resolveConnectedSkillsScopeId(params.userId, params.orgId),
        skill.id,
      );
      break;
    case "custom": {
      const custom = normalizeUserSkillSettings(params.settings).customSkills;
      content = custom.find((entry) => entry.id === skill.id)?.content ?? null;
      break;
    }
    default:
      content = null;
  }

  return content === null ? null : { skill, content };
}
