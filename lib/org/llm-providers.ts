import "server-only";

import { and, eq } from "drizzle-orm";
import {
  type AiProviderType,
  defaultLabelForProviderType,
  isHostedAiProviderType,
} from "@/lib/ai/provider-entries";
import { db } from "@/lib/db/client";
import {
  type OrgLlmProviderModeConfig,
  orgLlmProvider,
  userLlmKey,
  userLlmProviderAccess,
} from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/encryption";

export type OrgLlmProviderRow = {
  id: string;
  provider: string;
  providerType: AiProviderType;
  hasOrgApiKey: boolean;
  enabled: boolean;
  modeConfig: OrgLlmProviderModeConfig;
};

function rowToProvider(
  row: typeof orgLlmProvider.$inferSelect,
): OrgLlmProviderRow {
  const providerType = isHostedAiProviderType(row.provider)
    ? row.provider
    : "custom";

  return {
    id: row.id,
    provider: row.provider,
    providerType,
    hasOrgApiKey: Boolean(row.apiKeyEncrypted?.trim()),
    enabled: row.enabled,
    modeConfig: row.modeConfig ?? {},
  };
}

export async function listOrgLlmProviders(
  orgId: string,
): Promise<OrgLlmProviderRow[]> {
  const rows = await db
    .select()
    .from(orgLlmProvider)
    .where(eq(orgLlmProvider.orgId, orgId))
    .orderBy(orgLlmProvider.provider);

  return rows.map(rowToProvider);
}

export async function listEnabledOrgLlmProviders(
  orgId: string,
): Promise<OrgLlmProviderRow[]> {
  const providers = await listOrgLlmProviders(orgId);
  return providers.filter((provider) => provider.enabled);
}

export async function getOrgLlmProviderById({
  orgId,
  providerId,
}: {
  orgId: string;
  providerId: string;
}): Promise<typeof orgLlmProvider.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(orgLlmProvider)
    .where(
      and(eq(orgLlmProvider.id, providerId), eq(orgLlmProvider.orgId, orgId)),
    )
    .limit(1);

  return row ?? null;
}

export async function getOrgLlmProviderByType(
  orgId: string,
  provider: AiProviderType,
): Promise<typeof orgLlmProvider.$inferSelect | null> {
  if (!isHostedAiProviderType(provider)) {
    return null;
  }

  const [row] = await db
    .select()
    .from(orgLlmProvider)
    .where(
      and(
        eq(orgLlmProvider.orgId, orgId),
        eq(orgLlmProvider.provider, provider),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function createOrgLlmProvider({
  orgId,
  providerType,
  apiKey,
  label,
  baseUrl,
  speedModelId,
  reasoningModelId,
  maxIterations,
}: {
  orgId: string;
  providerType: AiProviderType;
  apiKey?: string | null;
  label?: string | null;
  baseUrl?: string | null;
  speedModelId?: string | null;
  reasoningModelId?: string | null;
  maxIterations?: string | null;
}): Promise<OrgLlmProviderRow> {
  const storedProvider = isHostedAiProviderType(providerType)
    ? providerType
    : "custom";

  const trimmedKey = apiKey?.trim();
  const modeConfig: OrgLlmProviderModeConfig = {
    label: label?.trim() || defaultLabelForProviderType(providerType),
    baseUrl: baseUrl?.trim() || undefined,
    speedModelId: speedModelId?.trim() || undefined,
    reasoningModelId: reasoningModelId?.trim() || undefined,
    maxIterations: maxIterations?.trim() || undefined,
  };

  const [inserted] = await db
    .insert(orgLlmProvider)
    .values({
      orgId,
      provider: storedProvider,
      apiKeyEncrypted: trimmedKey ? encrypt(trimmedKey) : null,
      enabled: true,
      modeConfig,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to create LLM provider.");
  }

  return rowToProvider(inserted);
}

export async function deleteOrgLlmProvider({
  orgId,
  providerId,
}: {
  orgId: string;
  providerId: string;
}): Promise<void> {
  await db
    .delete(userLlmProviderAccess)
    .where(eq(userLlmProviderAccess.providerId, providerId));
  await db.delete(userLlmKey).where(eq(userLlmKey.providerId, providerId));

  await db
    .delete(orgLlmProvider)
    .where(
      and(eq(orgLlmProvider.id, providerId), eq(orgLlmProvider.orgId, orgId)),
    );
}

export async function setOrgLlmProviderEnabled({
  orgId,
  providerId,
  enabled,
}: {
  orgId: string;
  providerId: string;
  enabled: boolean;
}): Promise<void> {
  await db
    .update(orgLlmProvider)
    .set({ enabled })
    .where(
      and(eq(orgLlmProvider.id, providerId), eq(orgLlmProvider.orgId, orgId)),
    );
}

export async function updateOrgLlmProvider({
  orgId,
  providerId,
  apiKey,
  modeConfig,
}: {
  orgId: string;
  providerId: string;
  apiKey?: string | null;
  modeConfig?: OrgLlmProviderModeConfig;
}): Promise<OrgLlmProviderRow> {
  const updates: Partial<typeof orgLlmProvider.$inferInsert> = {};

  if (apiKey !== undefined) {
    const trimmed = apiKey?.trim();
    updates.apiKeyEncrypted = trimmed ? encrypt(trimmed) : null;
  }

  if (modeConfig !== undefined) {
    updates.modeConfig = modeConfig;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(orgLlmProvider)
      .set(updates)
      .where(
        and(eq(orgLlmProvider.id, providerId), eq(orgLlmProvider.orgId, orgId)),
      );
  }

  const [row] = await db
    .select()
    .from(orgLlmProvider)
    .where(
      and(eq(orgLlmProvider.id, providerId), eq(orgLlmProvider.orgId, orgId)),
    )
    .limit(1);

  if (!row) {
    throw new Error("LLM provider not found.");
  }

  return rowToProvider(row);
}

export async function getOrgLlmProviderApiKey({
  orgId,
  providerId,
}: {
  orgId: string;
  providerId: string;
}): Promise<string | null> {
  const row = await getOrgLlmProviderById({ orgId, providerId });
  if (!row?.apiKeyEncrypted?.trim()) {
    return null;
  }

  try {
    return decrypt(row.apiKeyEncrypted) || null;
  } catch {
    return null;
  }
}

export async function userHasLlmProviderAccess({
  userId,
  providerId,
}: {
  userId: string;
  providerId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: userLlmProviderAccess.id })
    .from(userLlmProviderAccess)
    .where(
      and(
        eq(userLlmProviderAccess.userId, userId),
        eq(userLlmProviderAccess.providerId, providerId),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function grantUserLlmProviderAccess({
  userId,
  providerId,
}: {
  userId: string;
  providerId: string;
}): Promise<void> {
  const existing = await userHasLlmProviderAccess({ userId, providerId });
  if (existing) {
    return;
  }

  await db.insert(userLlmProviderAccess).values({ userId, providerId });
}

export async function revokeUserLlmProviderAccess({
  userId,
  providerId,
}: {
  userId: string;
  providerId: string;
}): Promise<void> {
  await db
    .delete(userLlmProviderAccess)
    .where(
      and(
        eq(userLlmProviderAccess.userId, userId),
        eq(userLlmProviderAccess.providerId, providerId),
      ),
    );
}

export async function listUserLlmProviderAccessIds(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ providerId: userLlmProviderAccess.providerId })
    .from(userLlmProviderAccess)
    .where(eq(userLlmProviderAccess.userId, userId));

  return rows.map((row) => row.providerId);
}

export async function setUserLlmProviderAccess({
  userId,
  orgId,
  providerIds,
}: {
  userId: string;
  orgId: string;
  providerIds: string[];
}): Promise<void> {
  const orgRows = await listOrgLlmProviders(orgId);
  const validIds = new Set(orgRows.map((row) => row.id));
  const uniqueIds = [...new Set(providerIds.filter((id) => validIds.has(id)))];

  const current = await listUserLlmProviderAccessIds(userId);
  const toAdd = uniqueIds.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !uniqueIds.includes(id));

  for (const providerId of toRemove) {
    await revokeUserLlmProviderAccess({ userId, providerId });
  }

  for (const providerId of toAdd) {
    await grantUserLlmProviderAccess({ userId, providerId });
  }
}

export async function grantUserAllOrgLlmProviders({
  userId,
  orgId,
}: {
  userId: string;
  orgId: string;
}): Promise<void> {
  const providers = await listEnabledOrgLlmProviders(orgId);
  for (const provider of providers) {
    await grantUserLlmProviderAccess({ userId, providerId: provider.id });
  }
}

export async function listEnabledOrgLlmProvidersForUser({
  orgId,
  userId,
}: {
  orgId: string;
  userId: string;
}): Promise<OrgLlmProviderRow[]> {
  const enabled = await listEnabledOrgLlmProviders(orgId);
  const grantIds = new Set(await listUserLlmProviderAccessIds(userId));
  return enabled.filter((provider) => grantIds.has(provider.id));
}
