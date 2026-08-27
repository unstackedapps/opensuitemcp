import { and, eq } from "drizzle-orm";
import { BUILTIN_SEARCH_RESOURCES } from "@/lib/ai/search-resources";
import { db } from "@/lib/db/client";
import {
  org,
  orgLlmProvider,
  orgPersona,
  orgSearchResource,
  userLlmProviderAccess,
  userPersonaAccess,
  userRole,
} from "@/lib/db/schema";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { listCatalogPersonaRefs } from "@/lib/org/personas/catalog-refs";

/**
 * CLI-safe post-migration bootstrap (no `server-only`).
 * Seeds org persona catalog and grants default member access for upgrades.
 */
export async function applyOrgMigrateBootstrapIfNeeded(): Promise<void> {
  if (!isOrgInstallMode()) {
    return;
  }

  const [defaultOrg] = await db.select().from(org).limit(1);
  if (!defaultOrg) {
    return;
  }

  await ensureOrgPersonaCatalogRows(defaultOrg.id);
  await ensureOrgSearchCatalogRows(defaultOrg.id);
  await grantDefaultMemberAccess(defaultOrg.id);
}

async function ensureOrgSearchCatalogRows(orgId: string): Promise<void> {
  const rows = await db
    .select({
      id: orgSearchResource.id,
      url: orgSearchResource.url,
      catalogId: orgSearchResource.catalogId,
    })
    .from(orgSearchResource)
    .where(eq(orgSearchResource.orgId, orgId));

  const present = new Set(
    rows
      .map((row) => row.catalogId)
      .filter((catalogId): catalogId is string => Boolean(catalogId)),
  );
  const toStamp = rows.filter(
    (row) =>
      !row.catalogId &&
      BUILTIN_SEARCH_RESOURCES.some((item) => item.url === row.url),
  );
  const toInsert = BUILTIN_SEARCH_RESOURCES.filter((item) => {
    if (present.has(item.catalogId)) {
      return false;
    }
    return !rows.some((row) => row.url === item.url);
  });

  const now = new Date();
  await Promise.all(
    toStamp.map((row) => {
      const builtin = BUILTIN_SEARCH_RESOURCES.find(
        (item) => item.url === row.url,
      );
      if (!builtin) {
        return Promise.resolve();
      }
      return db
        .update(orgSearchResource)
        .set({
          catalogId: builtin.catalogId,
          label: builtin.label,
          url: builtin.url,
          updatedAt: now,
        })
        .where(eq(orgSearchResource.id, row.id));
    }),
  );

  if (toInsert.length === 0) {
    return;
  }

  await db.insert(orgSearchResource).values(
    toInsert.map((item) => ({
      orgId,
      label: item.label,
      url: item.url,
      enabled: true,
      catalogId: item.catalogId,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

async function ensureOrgPersonaCatalogRows(orgId: string): Promise<void> {
  const personaRefs = listCatalogPersonaRefs();

  for (const personaRef of personaRefs) {
    const [existing] = await db
      .select({ id: orgPersona.id })
      .from(orgPersona)
      .where(
        and(eq(orgPersona.orgId, orgId), eq(orgPersona.personaRef, personaRef)),
      )
      .limit(1);

    if (existing) {
      continue;
    }

    await db.insert(orgPersona).values({
      orgId,
      personaRef,
      enabled: true,
    });
  }
}

async function grantDefaultMemberAccess(orgId: string): Promise<void> {
  const members = await db
    .select({ userId: userRole.userId })
    .from(userRole)
    .where(eq(userRole.orgId, orgId));

  const enabledProviders = await db
    .select({ id: orgLlmProvider.id })
    .from(orgLlmProvider)
    .where(
      and(eq(orgLlmProvider.orgId, orgId), eq(orgLlmProvider.enabled, true)),
    );

  const enabledPersonas = await db
    .select({ id: orgPersona.id })
    .from(orgPersona)
    .where(and(eq(orgPersona.orgId, orgId), eq(orgPersona.enabled, true)));

  for (const member of members) {
    for (const provider of enabledProviders) {
      await db
        .insert(userLlmProviderAccess)
        .values({ userId: member.userId, providerId: provider.id })
        .onConflictDoNothing({
          target: [
            userLlmProviderAccess.userId,
            userLlmProviderAccess.providerId,
          ],
        });
    }

    for (const persona of enabledPersonas) {
      await db
        .insert(userPersonaAccess)
        .values({ userId: member.userId, orgPersonaId: persona.id })
        .onConflictDoNothing({
          target: [userPersonaAccess.userId, userPersonaAccess.orgPersonaId],
        });
    }
  }
}
