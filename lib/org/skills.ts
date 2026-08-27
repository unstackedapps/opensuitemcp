import "server-only";

import { and, eq } from "drizzle-orm";
import {
  ALWAYS_ON_SKILL_ID,
  type CatalogSkill,
  listCommunityCatalogSkills,
  listOracleCatalogSkills,
} from "@/lib/ai/skills/catalog";
import { db } from "@/lib/db/client";
import { orgSkill } from "@/lib/db/schema";
import { isOrgInstallMode } from "@/lib/org/install-config";

export type OrgSkillRow = {
  id: string;
  skillRef: string;
  enabled: boolean;
  locked: boolean;
};

export type OrgSkillPolicy = Map<string, { enabled: boolean; locked: boolean }>;

function rowToSkill(row: typeof orgSkill.$inferSelect): OrgSkillRow {
  return {
    id: row.id,
    skillRef: row.skillRef,
    enabled: row.enabled,
    locked: row.locked,
  };
}

export function listCatalogSkillRefs(): string[] {
  const catalog = [
    ...listOracleCatalogSkills(),
    ...listCommunityCatalogSkills(),
  ];
  return catalog.map((skill) => skill.id);
}

/** Ensure every catalog skill has an org row (idempotent; safe under concurrent requests). */
export async function ensureOrgSkillCatalog(orgId: string): Promise<void> {
  for (const skillRef of listCatalogSkillRefs()) {
    await db
      .insert(orgSkill)
      .values({
        orgId,
        skillRef,
        enabled: true,
        locked: false,
      })
      .onConflictDoNothing({
        target: [orgSkill.orgId, orgSkill.skillRef],
      });
  }
}

export async function listOrgSkills(orgId: string): Promise<OrgSkillRow[]> {
  await ensureOrgSkillCatalog(orgId);

  const rows = await db
    .select()
    .from(orgSkill)
    .where(eq(orgSkill.orgId, orgId))
    .orderBy(orgSkill.skillRef);

  return rows.map(rowToSkill);
}

export async function listOrgSkillsForAdmin(orgId: string): Promise<
  Array<
    OrgSkillRow & {
      name: string;
      description: string;
      alwaysOn?: boolean;
      source: "oracle" | "community";
    }
  >
> {
  const orgRows = await listOrgSkills(orgId);
  const catalog = [
    ...listOracleCatalogSkills(),
    ...listCommunityCatalogSkills(),
  ];
  const catalogById = new Map(catalog.map((skill) => [skill.id, skill]));

  return orgRows.map((row) => {
    const catalogSkill = catalogById.get(row.skillRef);
    const source =
      catalogSkill?.source === "community" ? "community" : "oracle";
    return {
      ...row,
      name: catalogSkill?.name ?? row.skillRef,
      description: catalogSkill?.description ?? "",
      alwaysOn: catalogSkill?.alwaysOn,
      source,
    };
  });
}

export async function getOrgSkillPolicy(
  orgId: string,
): Promise<OrgSkillPolicy> {
  const rows = await listOrgSkills(orgId);
  const policy: OrgSkillPolicy = new Map();
  for (const row of rows) {
    policy.set(row.skillRef, { enabled: row.enabled, locked: row.locked });
  }
  return policy;
}

export function isSkillAllowedByOrgPolicy(
  skillId: string,
  policy: OrgSkillPolicy,
  alwaysOn = false,
): boolean {
  if (alwaysOn || skillId === ALWAYS_ON_SKILL_ID) {
    return true;
  }
  if (policy.size === 0) {
    return true;
  }
  const entry = policy.get(skillId);
  return Boolean(entry?.enabled);
}

export function filterCatalogByOrgPolicy(
  catalog: CatalogSkill[],
  policy: OrgSkillPolicy,
): CatalogSkill[] {
  return catalog.filter((skill) =>
    isSkillAllowedByOrgPolicy(skill.id, policy, skill.alwaysOn),
  );
}

export async function setOrgSkillEnabled({
  orgId,
  skillId,
  enabled,
}: {
  orgId: string;
  skillId: string;
  enabled: boolean;
}): Promise<void> {
  await db
    .update(orgSkill)
    .set({ enabled })
    .where(and(eq(orgSkill.id, skillId), eq(orgSkill.orgId, orgId)));
}

export async function setOrgSkillLocked({
  orgId,
  skillId,
  locked,
}: {
  orgId: string;
  skillId: string;
  locked: boolean;
}): Promise<void> {
  await db
    .update(orgSkill)
    .set({ locked })
    .where(and(eq(orgSkill.id, skillId), eq(orgSkill.orgId, orgId)));
}

export function applyOrgSkillPolicyToSettings({
  enabledSkillIds: _enabledSkillIds,
  policy,
  catalog,
}: {
  enabledSkillIds: string[];
  policy: OrgSkillPolicy;
  catalog: CatalogSkill[];
}): string[] {
  const allowedIds = filterCatalogByOrgPolicy(catalog, policy).map(
    (skill) => skill.id,
  );
  const alwaysOnIds = catalog
    .filter((skill) => skill.alwaysOn)
    .map((skill) => skill.id);
  return [...new Set([...allowedIds, ...alwaysOnIds])];
}

export async function getOrgSkillCatalogForDisplay(
  orgId: string,
): Promise<CatalogSkill[]> {
  const catalog = [
    ...listOracleCatalogSkills(),
    ...listCommunityCatalogSkills(),
  ];

  if (!isOrgInstallMode()) {
    return catalog;
  }

  const policy = await getOrgSkillPolicy(orgId);
  return filterCatalogByOrgPolicy(catalog, policy);
}

export function enabledCatalogSkillIdsFromOrgPolicy(
  policy: OrgSkillPolicy,
  catalog: CatalogSkill[],
): string[] {
  return catalog
    .filter((skill) =>
      isSkillAllowedByOrgPolicy(skill.id, policy, skill.alwaysOn),
    )
    .map((skill) => skill.id);
}

export function mergeOrgEnabledCatalogSkillIds(params: {
  orgEnabledIds: string[];
  userEnabledIds: string[];
  alwaysOnIds: string[];
}): string[] {
  const alwaysOn = new Set(params.alwaysOnIds);
  const userSet = new Set(params.userEnabledIds);
  const userHasPrefs = params.userEnabledIds.includes(ALWAYS_ON_SKILL_ID);
  const merged = new Set(params.alwaysOnIds);

  for (const id of params.orgEnabledIds) {
    if (alwaysOn.has(id) || !userHasPrefs || userSet.has(id)) {
      merged.add(id);
    }
  }

  return [...merged];
}

export function overlayUserCatalogSkillIds(params: {
  orgEnabledIds: string[];
  incomingIds: string[];
  alwaysOnIds: string[];
}): string[] {
  const allowed = new Set([...params.orgEnabledIds, ...params.alwaysOnIds]);
  for (const id of params.incomingIds) {
    if (!allowed.has(id)) {
      throw new Error(`Skill "${id}" is not enabled for your organization.`);
    }
  }

  const incomingSet = new Set(params.incomingIds);
  const next = new Set(params.alwaysOnIds);
  next.add(ALWAYS_ON_SKILL_ID);

  for (const id of params.orgEnabledIds) {
    if (incomingSet.has(id)) {
      next.add(id);
    }
  }

  return [...next];
}
