import "server-only";

import { and, eq } from "drizzle-orm";
import {
  assertSearchResourceList,
  BUILTIN_SEARCH_RESOURCES,
  isSeededSearchResource,
  type SearchResourceEntry,
} from "@/lib/ai/search-resources";
import { db } from "@/lib/db/client";
import { orgSearchResource } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";

export type OrgSearchResourceRow = {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  catalogId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function rowToSearchResource(
  row: typeof orgSearchResource.$inferSelect,
): OrgSearchResourceRow {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    enabled: row.enabled,
    catalogId: row.catalogId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function orgSearchResourceToClient(
  row: OrgSearchResourceRow,
): SearchResourceEntry {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    enabled: row.enabled,
    catalogId: row.catalogId,
    managedByOrg: true,
  };
}

export async function ensureOrgSearchCatalog(orgId: string): Promise<void> {
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

export async function listOrgSearchResources(
  orgId: string,
): Promise<OrgSearchResourceRow[]> {
  await ensureOrgSearchCatalog(orgId);
  const rows = await db
    .select()
    .from(orgSearchResource)
    .where(eq(orgSearchResource.orgId, orgId))
    .orderBy(orgSearchResource.label);

  return rows.map(rowToSearchResource);
}

export async function listEnabledOrgSearchResources(
  orgId: string,
): Promise<OrgSearchResourceRow[]> {
  const rows = await listOrgSearchResources(orgId);
  return rows.filter((row) => row.enabled);
}

export async function createOrgSearchResource({
  orgId,
  label,
  url,
}: {
  orgId: string;
  label: string;
  url: string;
}): Promise<OrgSearchResourceRow> {
  const existing = await listOrgSearchResources(orgId);
  const draft: SearchResourceEntry = {
    id: "draft",
    label,
    url,
    enabled: true,
    catalogId: null,
  };
  const validated = assertSearchResourceList([...existing, draft]);
  const createdEntry = validated.at(-1);
  if (!createdEntry) {
    throw new Error("Failed to create search resource.");
  }

  const now = new Date();
  try {
    const [created] = await db
      .insert(orgSearchResource)
      .values({
        orgId,
        label: createdEntry.label,
        url: createdEntry.url,
        enabled: true,
        catalogId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!created) {
      throw new Error("Failed to create search resource.");
    }
    return rowToSearchResource(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("That URL is already in the list.");
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to create search resource.");
  }
}

export async function updateOrgSearchResource({
  orgId,
  resourceId,
  label,
  url,
}: {
  orgId: string;
  resourceId: string;
  label: string;
  url: string;
}): Promise<OrgSearchResourceRow> {
  const existing = await listOrgSearchResources(orgId);
  const current = existing.find((row) => row.id === resourceId);
  if (!current) {
    throw new ChatSDKError("not_found:database", "Search resource not found.");
  }
  if (isSeededSearchResource(current)) {
    throw new Error(
      `${current.label} is a built-in resource and cannot be edited.`,
    );
  }

  const next = existing.map((row) =>
    row.id === resourceId
      ? { ...row, label, url, catalogId: row.catalogId }
      : row,
  );
  const validated = assertSearchResourceList(next);
  const updatedEntry = validated.find((item) => item.id === resourceId);
  if (!updatedEntry) {
    throw new ChatSDKError("not_found:database", "Search resource not found.");
  }

  try {
    const [updated] = await db
      .update(orgSearchResource)
      .set({
        label: updatedEntry.label,
        url: updatedEntry.url,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orgSearchResource.id, resourceId),
          eq(orgSearchResource.orgId, orgId),
        ),
      )
      .returning();

    if (!updated) {
      throw new ChatSDKError(
        "not_found:database",
        "Search resource not found.",
      );
    }
    return rowToSearchResource(updated);
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    if (isUniqueViolation(error)) {
      throw new Error("That URL is already in the list.");
    }
    throw new Error(
      error instanceof Error
        ? error.message
        : "Failed to update search resource.",
    );
  }
}

export async function setOrgSearchResourceEnabled({
  orgId,
  resourceId,
  enabled,
}: {
  orgId: string;
  resourceId: string;
  enabled: boolean;
}): Promise<void> {
  const [updated] = await db
    .update(orgSearchResource)
    .set({ enabled, updatedAt: new Date() })
    .where(
      and(
        eq(orgSearchResource.id, resourceId),
        eq(orgSearchResource.orgId, orgId),
      ),
    )
    .returning({ id: orgSearchResource.id });

  if (!updated) {
    throw new ChatSDKError("not_found:database", "Search resource not found.");
  }
}

export async function deleteOrgSearchResource({
  orgId,
  resourceId,
}: {
  orgId: string;
  resourceId: string;
}): Promise<void> {
  const [current] = await db
    .select()
    .from(orgSearchResource)
    .where(
      and(
        eq(orgSearchResource.id, resourceId),
        eq(orgSearchResource.orgId, orgId),
      ),
    )
    .limit(1);

  if (!current) {
    throw new ChatSDKError("not_found:database", "Search resource not found.");
  }
  if (isSeededSearchResource(current)) {
    throw new Error(
      `${current.label} is a built-in resource and cannot be removed.`,
    );
  }

  const [deleted] = await db
    .delete(orgSearchResource)
    .where(
      and(
        eq(orgSearchResource.id, resourceId),
        eq(orgSearchResource.orgId, orgId),
      ),
    )
    .returning({ id: orgSearchResource.id });

  if (!deleted) {
    throw new ChatSDKError("not_found:database", "Search resource not found.");
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  if ("code" in error && error.code === "23505") {
    return true;
  }
  if ("cause" in error) {
    return isUniqueViolation(error.cause);
  }
  return false;
}
