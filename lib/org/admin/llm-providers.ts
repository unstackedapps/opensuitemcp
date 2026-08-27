import "server-only";

import type { AiProviderType } from "@/lib/ai/provider-entries";
import { ChatSDKError } from "@/lib/errors";
import { getOrgUserRole } from "@/lib/org/admin/users";
import { writeOrgAuditLog } from "@/lib/org/audit";
import {
  createOrgLlmProvider,
  deleteOrgLlmProvider,
  grantUserLlmProviderAccess,
  listOrgLlmProviders,
  listUserLlmProviderAccessIds,
  type OrgLlmProviderRow,
  setOrgLlmProviderEnabled,
  setUserLlmProviderAccess,
  updateOrgLlmProvider,
} from "@/lib/org/llm-providers";

export type { OrgLlmProviderRow } from "@/lib/org/llm-providers";

async function ensureOwnerAccessToOrgLlmProvider({
  orgId,
  actorUserId,
  provider,
}: {
  orgId: string;
  actorUserId: string;
  provider: OrgLlmProviderRow;
}): Promise<void> {
  const role = await getOrgUserRole(orgId, actorUserId);
  if (role !== "owner" || !provider.enabled || !provider.hasOrgApiKey) {
    return;
  }

  await grantUserLlmProviderAccess({
    userId: actorUserId,
    providerId: provider.id,
  });
}

export async function syncOwnerLlmProviderAccess({
  orgId,
  actorUserId,
}: {
  orgId: string;
  actorUserId: string;
}): Promise<void> {
  const role = await getOrgUserRole(orgId, actorUserId);
  if (role !== "owner") {
    return;
  }

  const providers = await listOrgLlmProviders(orgId);
  const eligible = providers.filter(
    (provider) => provider.enabled && provider.hasOrgApiKey,
  );
  const current = await listUserLlmProviderAccessIds(actorUserId);

  for (const provider of eligible) {
    if (!current.includes(provider.id)) {
      await grantUserLlmProviderAccess({
        userId: actorUserId,
        providerId: provider.id,
      });
    }
  }
}

export async function listAdminOrgLlmProviders(
  orgId: string,
): Promise<OrgLlmProviderRow[]> {
  return listOrgLlmProviders(orgId);
}

export async function createAdminOrgLlmProvider({
  orgId,
  actorUserId,
  providerType,
  apiKey,
  label,
  baseUrl,
  speedModelId,
  reasoningModelId,
  maxIterations,
}: {
  orgId: string;
  actorUserId: string;
  providerType: AiProviderType;
  apiKey?: string | null;
  label?: string | null;
  baseUrl?: string | null;
  speedModelId?: string | null;
  reasoningModelId?: string | null;
  maxIterations?: string | null;
}): Promise<OrgLlmProviderRow> {
  try {
    const created = await createOrgLlmProvider({
      orgId,
      providerType,
      apiKey,
      label,
      baseUrl,
      speedModelId,
      reasoningModelId,
      maxIterations,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "llm_provider.create",
      targetType: "llm_provider",
      targetId: created.id,
      metadata: { providerType },
    });

    await ensureOwnerAccessToOrgLlmProvider({
      orgId,
      actorUserId,
      provider: created,
    });

    return created;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create provider.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function deleteAdminOrgLlmProvider({
  orgId,
  actorUserId,
  providerId,
}: {
  orgId: string;
  actorUserId: string;
  providerId: string;
}): Promise<void> {
  await deleteOrgLlmProvider({ orgId, providerId });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "llm_provider.delete",
    targetType: "llm_provider",
    targetId: providerId,
  });
}

export async function setAdminOrgLlmProviderEnabled({
  orgId,
  actorUserId,
  providerId,
  enabled,
}: {
  orgId: string;
  actorUserId: string;
  providerId: string;
  enabled: boolean;
}): Promise<void> {
  await setOrgLlmProviderEnabled({ orgId, providerId, enabled });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: enabled ? "llm_provider.enable" : "llm_provider.disable",
    targetType: "llm_provider",
    targetId: providerId,
  });

  if (enabled) {
    const providers = await listOrgLlmProviders(orgId);
    const provider = providers.find((row) => row.id === providerId);
    if (provider) {
      await ensureOwnerAccessToOrgLlmProvider({
        orgId,
        actorUserId,
        provider,
      });
    }
  }
}

export async function updateAdminOrgLlmProvider({
  orgId,
  actorUserId,
  providerId,
  apiKey,
  label,
  baseUrl,
  speedModelId,
  reasoningModelId,
  maxIterations,
}: {
  orgId: string;
  actorUserId: string;
  providerId: string;
  apiKey?: string | null;
  label?: string | null;
  baseUrl?: string | null;
  speedModelId?: string | null;
  reasoningModelId?: string | null;
  maxIterations?: string | null;
}): Promise<OrgLlmProviderRow> {
  try {
    const rows = await listOrgLlmProviders(orgId);
    const existing = rows.find((row) => row.id === providerId);

    if (!existing) {
      throw new ChatSDKError("bad_request:database", "LLM provider not found.");
    }

    const modeConfig = {
      ...existing.modeConfig,
      ...(label !== undefined
        ? { label: label?.trim() || existing.modeConfig.label }
        : {}),
      ...(baseUrl !== undefined
        ? { baseUrl: baseUrl?.trim() || undefined }
        : {}),
      ...(speedModelId !== undefined
        ? { speedModelId: speedModelId?.trim() || undefined }
        : {}),
      ...(reasoningModelId !== undefined
        ? { reasoningModelId: reasoningModelId?.trim() || undefined }
        : {}),
      ...(maxIterations !== undefined
        ? { maxIterations: maxIterations?.trim() || undefined }
        : {}),
    };

    const updated = await updateOrgLlmProvider({
      orgId,
      providerId,
      apiKey,
      modeConfig,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "llm_provider.update",
      targetType: "llm_provider",
      targetId: providerId,
      metadata: {
        hasApiKey: updated.hasOrgApiKey,
        maxIterations: updated.modeConfig.maxIterations,
      },
    });

    await ensureOwnerAccessToOrgLlmProvider({
      orgId,
      actorUserId,
      provider: updated,
    });

    return updated;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Failed to update provider.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function setAdminUserLlmProviderAccess({
  orgId,
  actorUserId,
  userId,
  providerIds,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
  providerIds: string[];
}): Promise<void> {
  const role = await getOrgUserRole(orgId, userId);
  if (!role) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  await setUserLlmProviderAccess({ userId, orgId, providerIds });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.llm_provider_access_update",
    targetType: "user",
    targetId: userId,
    metadata: { providerIds },
  });
}
