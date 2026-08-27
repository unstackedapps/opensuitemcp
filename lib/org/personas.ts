import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { AVA_PERSONA_ID, listBuiltinPersonas } from "@/lib/ai/personas/catalog";
import { db } from "@/lib/db/client";
import { orgPersona, userPersonaAccess } from "@/lib/db/schema";
import { listCatalogPersonaRefs } from "@/lib/org/personas/catalog-refs";

export { listCatalogPersonaRefs } from "@/lib/org/personas/catalog-refs";

export type OrgPersonaRow = {
  id: string;
  personaRef: string;
  enabled: boolean;
};

export type OrgPersonaPolicy = Map<string, { enabled: boolean }>;

function rowToPersona(row: typeof orgPersona.$inferSelect): OrgPersonaRow {
  return {
    id: row.id,
    personaRef: row.personaRef,
    enabled: row.enabled,
  };
}

export async function countOrgPersonas(orgId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orgPersona)
    .where(eq(orgPersona.orgId, orgId));
  return row?.count ?? 0;
}

export async function ensureOrgPersonaCatalog(orgId: string): Promise<void> {
  const count = await countOrgPersonas(orgId);
  if (count > 0) {
    return;
  }

  for (const personaRef of listCatalogPersonaRefs()) {
    await db.insert(orgPersona).values({
      orgId,
      personaRef,
      enabled: true,
    });
  }
}

export async function listOrgPersonas(orgId: string): Promise<OrgPersonaRow[]> {
  await ensureOrgPersonaCatalog(orgId);

  const rows = await db
    .select()
    .from(orgPersona)
    .where(eq(orgPersona.orgId, orgId))
    .orderBy(orgPersona.personaRef);

  return rows.map(rowToPersona);
}

export async function listOrgPersonasForAdmin(orgId: string): Promise<
  Array<
    OrgPersonaRow & {
      name: string;
      shortName: string;
      primaryRole: string;
      alwaysOn: boolean;
    }
  >
> {
  await ensureOrgPersonaCatalog(orgId);
  const orgRows = await listOrgPersonas(orgId);
  const catalog = listBuiltinPersonas();
  const catalogById = new Map(catalog.map((persona) => [persona.id, persona]));

  return orgRows.map((row) => {
    const catalogPersona = catalogById.get(row.personaRef);
    return {
      ...row,
      name: catalogPersona?.name ?? row.personaRef,
      shortName: catalogPersona?.shortName ?? row.personaRef,
      primaryRole: catalogPersona?.primaryRole ?? "",
      alwaysOn: row.personaRef === AVA_PERSONA_ID,
    };
  });
}

export async function getOrgPersonaPolicy(
  orgId: string,
): Promise<OrgPersonaPolicy> {
  const rows = await listOrgPersonas(orgId);
  const policy: OrgPersonaPolicy = new Map();
  for (const row of rows) {
    policy.set(row.personaRef, { enabled: row.enabled });
  }
  return policy;
}

export function isPersonaAllowedByOrgPolicy(
  personaId: string,
  policy: OrgPersonaPolicy,
): boolean {
  const id = personaId?.trim() || AVA_PERSONA_ID;
  if (id === AVA_PERSONA_ID) {
    return true;
  }
  if (policy.size === 0) {
    return true;
  }
  const entry = policy.get(id);
  return Boolean(entry?.enabled);
}

export async function setOrgPersonaEnabled({
  orgId,
  personaId,
  enabled,
}: {
  orgId: string;
  personaId: string;
  enabled: boolean;
}): Promise<void> {
  const [row] = await db
    .select({ personaRef: orgPersona.personaRef })
    .from(orgPersona)
    .where(and(eq(orgPersona.id, personaId), eq(orgPersona.orgId, orgId)))
    .limit(1);

  if (!row) {
    return;
  }

  if (row.personaRef === AVA_PERSONA_ID && !enabled) {
    return;
  }

  await db
    .update(orgPersona)
    .set({ enabled })
    .where(and(eq(orgPersona.id, personaId), eq(orgPersona.orgId, orgId)));
}

export async function listEnabledOrgPersonas(
  orgId: string,
): Promise<OrgPersonaRow[]> {
  await ensureOrgPersonaCatalog(orgId);

  const rows = await db
    .select()
    .from(orgPersona)
    .where(and(eq(orgPersona.orgId, orgId), eq(orgPersona.enabled, true)))
    .orderBy(orgPersona.personaRef);

  return rows.map(rowToPersona);
}

export async function getOrgPersonaByRef(
  orgId: string,
  personaRef: string,
): Promise<OrgPersonaRow | null> {
  await ensureOrgPersonaCatalog(orgId);

  const [row] = await db
    .select()
    .from(orgPersona)
    .where(
      and(eq(orgPersona.orgId, orgId), eq(orgPersona.personaRef, personaRef)),
    )
    .limit(1);

  return row ? rowToPersona(row) : null;
}

export async function userHasPersonaAccess({
  userId,
  orgPersonaId,
}: {
  userId: string;
  orgPersonaId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: userPersonaAccess.id })
    .from(userPersonaAccess)
    .where(
      and(
        eq(userPersonaAccess.userId, userId),
        eq(userPersonaAccess.orgPersonaId, orgPersonaId),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function grantUserPersonaAccess({
  userId,
  orgPersonaId,
}: {
  userId: string;
  orgPersonaId: string;
}): Promise<void> {
  const existing = await userHasPersonaAccess({ userId, orgPersonaId });
  if (existing) {
    return;
  }

  await db.insert(userPersonaAccess).values({ userId, orgPersonaId });
}

export async function revokeUserPersonaAccess({
  userId,
  orgPersonaId,
}: {
  userId: string;
  orgPersonaId: string;
}): Promise<void> {
  await db
    .delete(userPersonaAccess)
    .where(
      and(
        eq(userPersonaAccess.userId, userId),
        eq(userPersonaAccess.orgPersonaId, orgPersonaId),
      ),
    );
}

export async function listUserPersonaAccessIds(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ orgPersonaId: userPersonaAccess.orgPersonaId })
    .from(userPersonaAccess)
    .where(eq(userPersonaAccess.userId, userId));

  return rows.map((row) => row.orgPersonaId);
}

export async function setUserPersonaAccess({
  userId,
  orgId,
  orgPersonaIds,
}: {
  userId: string;
  orgId: string;
  orgPersonaIds: string[];
}): Promise<void> {
  const orgRows = await listOrgPersonas(orgId);
  const validIds = new Set(orgRows.map((row) => row.id));
  const avaRow = orgRows.find((row) => row.personaRef === AVA_PERSONA_ID);
  const uniqueIds = [
    ...new Set(orgPersonaIds.filter((id) => validIds.has(id))),
  ];
  if (avaRow && !uniqueIds.includes(avaRow.id)) {
    uniqueIds.push(avaRow.id);
  }

  const current = await listUserPersonaAccessIds(userId);
  const toAdd = uniqueIds.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !uniqueIds.includes(id));

  for (const orgPersonaId of toRemove) {
    await revokeUserPersonaAccess({ userId, orgPersonaId });
  }

  for (const orgPersonaId of toAdd) {
    await grantUserPersonaAccess({ userId, orgPersonaId });
  }
}

export async function grantUserAllOrgPersonas({
  userId,
  orgId,
}: {
  userId: string;
  orgId: string;
}): Promise<void> {
  const personas = await listEnabledOrgPersonas(orgId);
  for (const persona of personas) {
    await grantUserPersonaAccess({ userId, orgPersonaId: persona.id });
  }
}
