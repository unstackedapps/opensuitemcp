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
  createAdminOrgSearchResource,
  deleteAdminOrgSearchResource,
  setAdminOrgSearchResourceEnabled,
  updateAdminOrgSearchResource,
} from "@/lib/org/admin/search-resources";

const resourceBodySchema = z.object({
  label: z.string().min(1).max(128),
  url: z.string().min(1).max(2048),
});

const resourceIdSchema = z.object({
  resourceId: z.string().uuid(),
});

const enabledSchema = resourceIdSchema.extend({
  enabled: z.boolean(),
});

function revalidateSearch(): void {
  revalidatePath("/admin/search");
  revalidatePath("/onboarding");
  revalidatePath("/api/onboarding/readiness");
  revalidatePath("/");
}

export async function adminCreateSearchResource(
  input: z.infer<typeof resourceBodySchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = resourceBodySchema.parse(input);
    await createAdminOrgSearchResource({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      label: validated.label,
      url: validated.url,
    });
    revalidateSearch();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminUpdateSearchResource(
  input: z.infer<typeof resourceIdSchema> & z.infer<typeof resourceBodySchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = resourceIdSchema.merge(resourceBodySchema).parse(input);
    await updateAdminOrgSearchResource({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      resourceId: validated.resourceId,
      label: validated.label,
      url: validated.url,
    });
    revalidateSearch();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetSearchResourceEnabled(
  input: z.infer<typeof enabledSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = enabledSchema.parse(input);
    await setAdminOrgSearchResourceEnabled({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      resourceId: validated.resourceId,
      enabled: validated.enabled,
    });
    revalidateSearch();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminDeleteSearchResource(
  input: z.infer<typeof resourceIdSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = resourceIdSchema.parse(input);
    await deleteAdminOrgSearchResource({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      resourceId: validated.resourceId,
    });
    revalidateSearch();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}
