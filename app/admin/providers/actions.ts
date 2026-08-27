"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type AdminActionResult,
  adminActionFailed,
  adminActionUnauthorized,
} from "@/lib/org/admin/action-result";
import { getAdminActor } from "@/lib/org/admin/actor";
import {
  createAdminOrgLlmProvider,
  deleteAdminOrgLlmProvider,
  setAdminOrgLlmProviderEnabled,
  setAdminUserLlmProviderAccess,
  syncOwnerLlmProviderAccess,
  updateAdminOrgLlmProvider,
} from "@/lib/org/admin/llm-providers";

const providerIdSchema = z.object({
  providerId: z.string().uuid(),
});

const enabledSchema = providerIdSchema.extend({
  enabled: z.boolean(),
});

const providerTypeSchema = z.enum(["google", "anthropic", "openai", "custom"]);

const createSchema = z.object({
  providerType: providerTypeSchema,
  apiKey: z.string().max(4096).optional().nullable(),
  label: z.string().max(64).optional().nullable(),
  baseUrl: z.string().max(512).optional().nullable(),
  speedModelId: z.string().max(256).optional().nullable(),
  reasoningModelId: z.string().max(256).optional().nullable(),
  maxIterations: z.string().max(8).optional().nullable(),
});

const updateSchema = providerIdSchema.extend({
  apiKey: z.string().max(4096).optional().nullable(),
  label: z.string().max(64).optional().nullable(),
  baseUrl: z.string().max(512).optional().nullable(),
  speedModelId: z.string().max(256).optional().nullable(),
  reasoningModelId: z.string().max(256).optional().nullable(),
  maxIterations: z.string().max(8).optional().nullable(),
});

const userLlmProviderSchema = z.object({
  userId: z.string().uuid(),
  providerIds: z.array(z.string().uuid()),
});

function revalidateProviders(): void {
  revalidatePath("/admin/providers");
  revalidatePath("/admin/users");
  revalidatePath("/onboarding");
  revalidatePath("/");
}

export async function adminCreateLlmProvider(
  input: z.infer<typeof createSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = createSchema.parse(input);
    await createAdminOrgLlmProvider({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      providerType: validated.providerType,
      apiKey: validated.apiKey,
      label: validated.label,
      baseUrl: validated.baseUrl,
      speedModelId: validated.speedModelId,
      reasoningModelId: validated.reasoningModelId,
      maxIterations: validated.maxIterations,
    });
    revalidateProviders();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminDeleteLlmProvider(
  input: z.infer<typeof providerIdSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = providerIdSchema.parse(input);
    await deleteAdminOrgLlmProvider({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      providerId: validated.providerId,
    });
    revalidateProviders();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetLlmProviderEnabled(
  input: z.infer<typeof enabledSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = enabledSchema.parse(input);
    await setAdminOrgLlmProviderEnabled({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      providerId: validated.providerId,
      enabled: validated.enabled,
    });
    revalidateProviders();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminUpdateLlmProvider(
  input: z.infer<typeof updateSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = updateSchema.parse(input);
    await updateAdminOrgLlmProvider({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      providerId: validated.providerId,
      apiKey: validated.apiKey,
      label: validated.label,
      baseUrl: validated.baseUrl,
      speedModelId: validated.speedModelId,
      reasoningModelId: validated.reasoningModelId,
      maxIterations: validated.maxIterations,
    });
    revalidateProviders();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetUserLlmProviderAccess(
  input: z.infer<typeof userLlmProviderSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = userLlmProviderSchema.parse(input);
    await setAdminUserLlmProviderAccess({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
      providerIds: validated.providerIds,
    });
    revalidateProviders();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSyncOwnerLlmProviderAccess(): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    await syncOwnerLlmProviderAccess({
      orgId: actor.orgId,
      actorUserId: actor.userId,
    });
    revalidateProviders();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}
