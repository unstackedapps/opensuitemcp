import "server-only";

import { and, eq } from "drizzle-orm";
import type { ConnectedSkillSource } from "@/lib/ai/skills/catalog";
import {
  removeConnectedSkillSource,
  syncConnectedSkillSource,
} from "@/lib/ai/skills/sync-connected";
import { db } from "@/lib/db/client";
import { orgConnectedSkillSource } from "@/lib/db/schema";
import { isOrgInstallMode } from "@/lib/org/install-config";

function rowToConnectedSource(
  row: typeof orgConnectedSkillSource.$inferSelect,
): ConnectedSkillSource {
  return {
    id: row.id,
    url: row.url,
    owner: row.owner,
    repo: row.repo,
    ref: row.ref,
    path: row.path,
    label: row.label,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    skillCount: row.skillCount,
    lastError: row.lastError ?? null,
  };
}

/** Disk cache scope for connected skills (org id in org mode, user id in solo). */
export function resolveConnectedSkillsScopeId(
  userId: string,
  orgId: string | null | undefined,
): string {
  if (isOrgInstallMode() && orgId) {
    return orgId;
  }
  return userId;
}

export async function listOrgConnectedSkillSources(
  orgId: string,
): Promise<ConnectedSkillSource[]> {
  const rows = await listOrgConnectedSkillSourceRows(orgId);
  return rows.map(({ enabled: _enabled, ...source }) => source);
}

export type OrgConnectedSkillSourceRow = ConnectedSkillSource & {
  enabled: boolean;
};

export async function listOrgConnectedSkillSourceRows(
  orgId: string,
): Promise<OrgConnectedSkillSourceRow[]> {
  const rows = await db
    .select()
    .from(orgConnectedSkillSource)
    .where(eq(orgConnectedSkillSource.orgId, orgId))
    .orderBy(orgConnectedSkillSource.label);

  return rows.map((row) => ({
    ...rowToConnectedSource(row),
    enabled: row.enabled,
  }));
}

export async function listEnabledOrgConnectedSkillSources(
  orgId: string,
): Promise<ConnectedSkillSource[]> {
  const rows = await db
    .select()
    .from(orgConnectedSkillSource)
    .where(
      and(
        eq(orgConnectedSkillSource.orgId, orgId),
        eq(orgConnectedSkillSource.enabled, true),
      ),
    )
    .orderBy(orgConnectedSkillSource.label);

  return rows.map(rowToConnectedSource);
}

export async function getOrgConnectedSkillSource({
  orgId,
  sourceId,
}: {
  orgId: string;
  sourceId: string;
}): Promise<ConnectedSkillSource | null> {
  const [row] = await db
    .select()
    .from(orgConnectedSkillSource)
    .where(
      and(
        eq(orgConnectedSkillSource.orgId, orgId),
        eq(orgConnectedSkillSource.id, sourceId),
      ),
    )
    .limit(1);

  return row ? rowToConnectedSource(row) : null;
}

async function upsertOrgConnectedRow(
  orgId: string,
  source: ConnectedSkillSource,
): Promise<ConnectedSkillSource> {
  const [existing] = await db
    .select()
    .from(orgConnectedSkillSource)
    .where(
      and(
        eq(orgConnectedSkillSource.orgId, orgId),
        eq(orgConnectedSkillSource.id, source.id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(orgConnectedSkillSource)
      .set({
        url: source.url,
        owner: source.owner,
        repo: source.repo,
        ref: source.ref,
        path: source.path,
        label: source.label,
        lastSyncedAt: new Date(source.lastSyncedAt),
        skillCount: source.skillCount,
        lastError: source.lastError ?? null,
        enabled: true,
      })
      .where(eq(orgConnectedSkillSource.id, source.id));
    return source;
  }

  await db.insert(orgConnectedSkillSource).values({
    id: source.id,
    orgId,
    url: source.url,
    owner: source.owner,
    repo: source.repo,
    ref: source.ref,
    path: source.path,
    label: source.label,
    lastSyncedAt: new Date(source.lastSyncedAt),
    skillCount: source.skillCount,
    lastError: source.lastError ?? null,
    enabled: true,
  });

  return source;
}

export async function connectOrgConnectedSkillSource({
  orgId,
  url,
}: {
  orgId: string;
  url: string;
}): Promise<ConnectedSkillSource> {
  const { source } = await syncConnectedSkillSource({
    userId: orgId,
    url,
  });
  return upsertOrgConnectedRow(orgId, source);
}

export async function refreshOrgConnectedSkillSource({
  orgId,
  sourceId,
}: {
  orgId: string;
  sourceId: string;
}): Promise<ConnectedSkillSource> {
  const existing = await getOrgConnectedSkillSource({ orgId, sourceId });
  if (!existing) {
    throw new Error("Connected skill pack not found.");
  }

  const { source } = await syncConnectedSkillSource({
    userId: orgId,
    url: existing.url,
    existing,
  });
  return upsertOrgConnectedRow(orgId, source);
}

export async function disconnectOrgConnectedSkillSource({
  orgId,
  sourceId,
}: {
  orgId: string;
  sourceId: string;
}): Promise<void> {
  const existing = await getOrgConnectedSkillSource({ orgId, sourceId });
  if (!existing) {
    return;
  }

  removeConnectedSkillSource(orgId, sourceId);
  await db
    .delete(orgConnectedSkillSource)
    .where(
      and(
        eq(orgConnectedSkillSource.orgId, orgId),
        eq(orgConnectedSkillSource.id, sourceId),
      ),
    );
}

export async function setOrgConnectedSkillSourceEnabled({
  orgId,
  sourceId,
  enabled,
}: {
  orgId: string;
  sourceId: string;
  enabled: boolean;
}): Promise<void> {
  await db
    .update(orgConnectedSkillSource)
    .set({ enabled })
    .where(
      and(
        eq(orgConnectedSkillSource.orgId, orgId),
        eq(orgConnectedSkillSource.id, sourceId),
      ),
    );
}
