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
  setAdminAgentAccessMembers,
  setAdminAgentAccessPolicy,
} from "@/lib/org/admin/agent-access";

const policySchema = z.object({
  enabled: z.boolean().optional(),
  memberAccess: z.enum(["all", "selected"]).optional(),
  maxKeysPerUser: z.number().int().min(1).max(100).optional(),
});

const membersSchema = z.object({
  userIds: z.array(z.string().uuid()),
});

function revalidateAgentAccess(): void {
  revalidatePath("/admin/agent-access");
  revalidatePath("/admin/users");
  revalidatePath("/");
}

export async function adminSetAgentAccessPolicy(
  input: z.infer<typeof policySchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = policySchema.parse(input);
    await setAdminAgentAccessPolicy({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      ...validated,
    });
    revalidateAgentAccess();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetAgentAccessMembers(
  input: z.infer<typeof membersSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = membersSchema.parse(input);
    await setAdminAgentAccessMembers({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userIds: validated.userIds,
    });
    revalidateAgentAccess();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}
