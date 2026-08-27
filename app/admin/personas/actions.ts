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
  setAdminOrgPersonaEnabled,
  setAdminUserPersonaAccess,
} from "@/lib/org/admin/personas";

const personaIdSchema = z.object({
  personaId: z.string().uuid(),
});

const enabledSchema = personaIdSchema.extend({
  enabled: z.boolean(),
});

const userPersonaSchema = z.object({
  userId: z.string().uuid(),
  orgPersonaIds: z.array(z.string().uuid()),
});

function revalidatePersonas(): void {
  revalidatePath("/admin/personas");
  revalidatePath("/admin/users");
  revalidatePath("/");
}

export async function adminSetOrgPersonaEnabled(
  input: z.infer<typeof enabledSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = enabledSchema.parse(input);
    await setAdminOrgPersonaEnabled({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      personaId: validated.personaId,
      enabled: validated.enabled,
    });
    revalidatePersonas();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetUserPersonaAccess(
  input: z.infer<typeof userPersonaSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = userPersonaSchema.parse(input);
    await setAdminUserPersonaAccess({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
      orgPersonaIds: validated.orgPersonaIds,
    });
    revalidatePersonas();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}
