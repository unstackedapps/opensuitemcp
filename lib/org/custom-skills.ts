import "server-only";

import { and, eq } from "drizzle-orm";
import type { CustomSkill } from "@/lib/ai/skills/catalog";
import { db } from "@/lib/db/client";
import { orgCustomSkill } from "@/lib/db/schema";

export const ORG_CUSTOM_SKILL_ID_PREFIX = "org-custom:";

export type OrgCustomSkillRow = {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function rowToOrgCustomSkill(
  row: typeof orgCustomSkill.$inferSelect,
): OrgCustomSkillRow {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function orgCustomSkillClientId(rowId: string): string {
  return `${ORG_CUSTOM_SKILL_ID_PREFIX}${rowId}`;
}

export function isOrgManagedCustomSkillId(id: string): boolean {
  return id.startsWith(ORG_CUSTOM_SKILL_ID_PREFIX);
}

export function orgCustomSkillRowIdFromClientId(clientId: string): string {
  if (!isOrgManagedCustomSkillId(clientId)) {
    throw new Error("Not an org custom skill id.");
  }
  return clientId.slice(ORG_CUSTOM_SKILL_ID_PREFIX.length);
}

export function orgCustomSkillToClientSkill(
  row: OrgCustomSkillRow,
): CustomSkill {
  return {
    id: orgCustomSkillClientId(row.id),
    name: row.name,
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
    enabled: row.enabled,
    managedByOrg: true,
  };
}

export function mergeOrgCustomSkillsForUser(params: {
  orgSkills: CustomSkill[];
  userSkills: CustomSkill[];
}): CustomSkill[] {
  const userById = new Map(params.userSkills.map((skill) => [skill.id, skill]));
  const personal = params.userSkills.filter(
    (skill) => !isOrgManagedCustomSkillId(skill.id) && !skill.managedByOrg,
  );
  const mergedOrg = params.orgSkills.map((org) => ({
    ...org,
    managedByOrg: true,
    enabled: userById.get(org.id)?.enabled !== false,
  }));
  return [...mergedOrg, ...personal];
}

export function overlayOrgUserCustomSkills(params: {
  orgSkills: CustomSkill[];
  incoming: CustomSkill[];
}): CustomSkill[] {
  const orgIds = new Set(params.orgSkills.map((skill) => skill.id));
  const incomingOrg = params.incoming.filter(
    (skill) => isOrgManagedCustomSkillId(skill.id) || skill.managedByOrg,
  );
  for (const skill of incomingOrg) {
    if (!orgIds.has(skill.id)) {
      throw new Error("Organization custom skills cannot be modified.");
    }
  }

  const incomingById = new Map(incomingOrg.map((skill) => [skill.id, skill]));
  const orgOverlay = params.orgSkills.map((org) => ({
    id: org.id,
    name: org.name,
    content: "",
    updatedAt: org.updatedAt,
    enabled: incomingById.get(org.id)?.enabled !== false,
    managedByOrg: true,
  }));
  const personal = params.incoming.filter(
    (skill) => !isOrgManagedCustomSkillId(skill.id) && !skill.managedByOrg,
  );
  return [...orgOverlay, ...personal];
}

export async function listOrgCustomSkills(
  orgId: string,
): Promise<OrgCustomSkillRow[]> {
  const rows = await db
    .select()
    .from(orgCustomSkill)
    .where(eq(orgCustomSkill.orgId, orgId))
    .orderBy(orgCustomSkill.name);

  return rows.map(rowToOrgCustomSkill);
}

export async function listEnabledOrgCustomSkills(
  orgId: string,
): Promise<OrgCustomSkillRow[]> {
  const rows = await listOrgCustomSkills(orgId);
  return rows.filter((row) => row.enabled);
}

export async function createOrgCustomSkill({
  orgId,
  name,
  content,
}: {
  orgId: string;
  name: string;
  content: string;
}): Promise<OrgCustomSkillRow> {
  const trimmedName = name.trim();
  const trimmedContent = content.trim();
  if (!trimmedName) {
    throw new Error("Skill name is required.");
  }
  if (!trimmedContent) {
    throw new Error("Skill content is required.");
  }

  const [inserted] = await db
    .insert(orgCustomSkill)
    .values({
      orgId,
      name: trimmedName.slice(0, 128),
      content: trimmedContent,
      enabled: true,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to create org custom skill.");
  }

  return rowToOrgCustomSkill(inserted);
}

export async function updateOrgCustomSkill({
  orgId,
  skillId,
  name,
  content,
}: {
  orgId: string;
  skillId: string;
  name: string;
  content: string;
}): Promise<OrgCustomSkillRow> {
  const trimmedName = name.trim();
  const trimmedContent = content.trim();
  if (!trimmedName) {
    throw new Error("Skill name is required.");
  }
  if (!trimmedContent) {
    throw new Error("Skill content is required.");
  }

  const [existing] = await db
    .select()
    .from(orgCustomSkill)
    .where(and(eq(orgCustomSkill.id, skillId), eq(orgCustomSkill.orgId, orgId)))
    .limit(1);

  if (!existing) {
    throw new Error("Org custom skill not found.");
  }

  const [updated] = await db
    .update(orgCustomSkill)
    .set({
      name: trimmedName.slice(0, 128),
      content: trimmedContent,
      updatedAt: new Date(),
    })
    .where(eq(orgCustomSkill.id, skillId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update org custom skill.");
  }

  return rowToOrgCustomSkill(updated);
}

export async function setOrgCustomSkillEnabled({
  orgId,
  skillId,
  enabled,
}: {
  orgId: string;
  skillId: string;
  enabled: boolean;
}): Promise<void> {
  await db
    .update(orgCustomSkill)
    .set({ enabled, updatedAt: new Date() })
    .where(
      and(eq(orgCustomSkill.id, skillId), eq(orgCustomSkill.orgId, orgId)),
    );
}

export async function deleteOrgCustomSkill({
  orgId,
  skillId,
}: {
  orgId: string;
  skillId: string;
}): Promise<void> {
  await db
    .delete(orgCustomSkill)
    .where(
      and(eq(orgCustomSkill.id, skillId), eq(orgCustomSkill.orgId, orgId)),
    );
}
