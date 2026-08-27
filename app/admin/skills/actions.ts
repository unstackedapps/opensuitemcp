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
  connectAdminOrgConnectedSkillSource,
  disconnectAdminOrgConnectedSkillSource,
  refreshAdminOrgConnectedSkillSource,
  setAdminOrgConnectedSkillSourceEnabled,
} from "@/lib/org/admin/connected-skills";
import {
  createAdminOrgCustomSkill,
  deleteAdminOrgCustomSkill,
  setAdminOrgCustomSkillEnabled,
  updateAdminOrgCustomSkill,
} from "@/lib/org/admin/custom-skills";
import { setAdminOrgSkillEnabled } from "@/lib/org/admin/skills";

const skillIdSchema = z.object({
  skillId: z.string().uuid(),
});

const enabledSchema = skillIdSchema.extend({
  enabled: z.boolean(),
});

const customSkillBodySchema = z.object({
  name: z.string().min(1).max(128),
  content: z.string().min(1).max(32_000),
});

const customSkillIdSchema = z.object({
  customSkillId: z.string().uuid(),
});

const customEnabledSchema = customSkillIdSchema.extend({
  enabled: z.boolean(),
});

function revalidateSkills(): void {
  revalidatePath("/admin/skills");
  revalidatePath("/admin/skills/oracle");
  revalidatePath("/admin/skills/community");
  revalidatePath("/admin/skills/connected");
  revalidatePath("/admin/skills/custom");
  revalidatePath("/");
}

export async function adminSetOrgSkillEnabled(
  input: z.infer<typeof enabledSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = enabledSchema.parse(input);
    await setAdminOrgSkillEnabled({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      skillId: validated.skillId,
      enabled: validated.enabled,
    });
    revalidateSkills();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminCreateOrgCustomSkill(
  input: z.infer<typeof customSkillBodySchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = customSkillBodySchema.parse(input);
    await createAdminOrgCustomSkill({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      name: validated.name,
      content: validated.content,
    });
    revalidateSkills();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminUpdateOrgCustomSkill(
  input: z.infer<typeof customSkillIdSchema> &
    z.infer<typeof customSkillBodySchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = customSkillIdSchema
      .merge(customSkillBodySchema)
      .parse(input);
    await updateAdminOrgCustomSkill({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      skillId: validated.customSkillId,
      name: validated.name,
      content: validated.content,
    });
    revalidateSkills();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetOrgCustomSkillEnabled(
  input: z.infer<typeof customEnabledSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = customEnabledSchema.parse(input);
    await setAdminOrgCustomSkillEnabled({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      skillId: validated.customSkillId,
      enabled: validated.enabled,
    });
    revalidateSkills();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminDeleteOrgCustomSkill(
  input: z.infer<typeof customSkillIdSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = customSkillIdSchema.parse(input);
    await deleteAdminOrgCustomSkill({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      skillId: validated.customSkillId,
    });
    revalidateSkills();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

const connectUrlSchema = z.object({
  url: z.string().min(3).max(2048),
});

const connectedSourceIdSchema = z.object({
  sourceId: z.string().min(1).max(64),
});

const connectedEnabledSchema = connectedSourceIdSchema.extend({
  enabled: z.boolean(),
});

export async function adminConnectOrgConnectedSkillSource(
  input: z.infer<typeof connectUrlSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = connectUrlSchema.parse(input);
    await connectAdminOrgConnectedSkillSource({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      url: validated.url,
    });
    revalidateSkills();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminRefreshOrgConnectedSkillSource(
  input: z.infer<typeof connectedSourceIdSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = connectedSourceIdSchema.parse(input);
    await refreshAdminOrgConnectedSkillSource({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      sourceId: validated.sourceId,
    });
    revalidateSkills();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminDisconnectOrgConnectedSkillSource(
  input: z.infer<typeof connectedSourceIdSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = connectedSourceIdSchema.parse(input);
    await disconnectAdminOrgConnectedSkillSource({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      sourceId: validated.sourceId,
    });
    revalidateSkills();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetOrgConnectedSkillSourceEnabled(
  input: z.infer<typeof connectedEnabledSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = connectedEnabledSchema.parse(input);
    await setAdminOrgConnectedSkillSourceEnabled({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      sourceId: validated.sourceId,
      enabled: validated.enabled,
    });
    revalidateSkills();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}
