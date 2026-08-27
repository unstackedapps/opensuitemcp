"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type AdminActionResult,
  adminActionFailed,
  adminActionUnauthorized,
} from "@/lib/org/admin/action-result";
import { getAdminActor } from "@/lib/org/admin/actor";
import { bulkSetOrgUserAccess } from "@/lib/org/admin/user-bulk-access";
import { provisionOrgUsers } from "@/lib/org/admin/user-provisioning";
import { setOrgUserTags } from "@/lib/org/admin/user-tags";
import {
  createOrgUser,
  deleteOrgUser,
  requireOrgUserPasswordReset,
  setOrgUserRole,
  setOrgUserSignInMethod,
  setOrgUserStatus,
  updateOrgUserProfile,
} from "@/lib/org/admin/users";
import { isOrgOwnerRole } from "@/lib/org/types";
import { allowAuthAttempt } from "@/lib/rate-limit";

const createUserSchema = z.discriminatedUnion("signInMethod", [
  z.object({
    signInMethod: z.literal("basic"),
    email: z.string().email(),
    name: z.string().max(128).optional().nullable(),
    password: z.string().min(6),
    role: z.enum(["owner", "admin", "member"]),
  }),
  z.object({
    signInMethod: z.literal("oidc"),
    email: z.string().email(),
    name: z.string().max(128).optional().nullable(),
    role: z.enum(["owner", "admin", "member"]),
  }),
]);

const userIdSchema = z.object({
  userId: z.string().uuid(),
});

const roleSchema = userIdSchema.extend({
  role: z.enum(["owner", "admin", "member"]),
});

const statusSchema = userIdSchema.extend({
  status: z.enum(["active", "disabled"]),
});

const signInMethodSchema = z.discriminatedUnion("signInMethod", [
  z.object({
    userId: z.string().uuid(),
    signInMethod: z.literal("oidc"),
  }),
  z.object({
    userId: z.string().uuid(),
    signInMethod: z.literal("basic"),
    password: z.string().min(6),
  }),
]);

const profileSchema = userIdSchema.extend({
  name: z.string().max(128).nullable(),
});

const userTagsSchema = userIdSchema.extend({
  tags: z.array(z.string().max(64)).max(32),
});

const provisionRowSchema = z.object({
  line: z.number().int().positive(),
  email: z.string().email(),
  name: z.string().max(128).nullable(),
  role: z.enum(["owner", "admin", "member"]),
  disabled: z.boolean(),
  action: z.enum(["upsert", "delete"]),
});

const provisionSchema = z.object({
  rows: z.array(provisionRowSchema).max(5000),
});

const bulkAccessSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  oidcAccountIds: z.array(z.string().uuid()).optional(),
  netsuiteMcpAccountIds: z.array(z.string().uuid()).optional(),
  orgPersonaIds: z.array(z.string().uuid()).optional(),
  providerIds: z.array(z.string().uuid()).optional(),
});

function revalidateUsers(): void {
  revalidatePath("/admin/users");
}

export async function adminCreateUser(
  input: z.infer<typeof createUserSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = createUserSchema.parse(input);
    if (validated.role === "owner" && !isOrgOwnerRole(actor.role)) {
      return { ok: false, error: "Only owners can create owners." };
    }

    if (!(await allowAuthAttempt(validated.email))) {
      return { ok: false, error: "Too many attempts." };
    }

    await createOrgUser({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      email: validated.email,
      name: validated.name,
      password:
        validated.signInMethod === "basic" ? validated.password : undefined,
      role: validated.role,
      signInMethod: validated.signInMethod,
    });
    revalidateUsers();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetUserRole(
  input: z.infer<typeof roleSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = roleSchema.parse(input);
    await setOrgUserRole({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      userId: validated.userId,
      role: validated.role,
    });
    revalidateUsers();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetUserStatus(
  input: z.infer<typeof statusSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = statusSchema.parse(input);
    await setOrgUserStatus({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
      status: validated.status,
    });
    revalidateUsers();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminRequirePasswordReset(
  input: z.infer<typeof userIdSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = userIdSchema.parse(input);
    await requireOrgUserPasswordReset({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
    });
    revalidateUsers();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetUserSignInMethod(
  input: z.infer<typeof signInMethodSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = signInMethodSchema.parse(input);
    await setOrgUserSignInMethod({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
      signInMethod: validated.signInMethod,
      password:
        validated.signInMethod === "basic" ? validated.password : undefined,
    });
    revalidateUsers();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminDeleteUser(
  input: z.infer<typeof userIdSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = userIdSchema.parse(input);
    if (validated.userId === actor.userId) {
      return { ok: false, error: "Cannot delete your account." };
    }

    await deleteOrgUser({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
    });
    revalidateUsers();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminUpdateUserProfile(
  input: z.infer<typeof profileSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = profileSchema.parse(input);
    await updateOrgUserProfile({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
      name: validated.name,
    });
    revalidateUsers();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetUserTags(
  input: z.infer<typeof userTagsSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = userTagsSchema.parse(input);
    await setOrgUserTags({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
      tagNames: validated.tags,
    });
    revalidateUsers();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminProvisionUsers(
  input: z.infer<typeof provisionSchema>,
): Promise<
  | {
      ok: true;
      created: number;
      updated: number;
      deleted: number;
      errors: string[];
    }
  | { ok: false; error: string }
> {
  const actor = await getAdminActor();
  if (!actor) {
    return { ok: false, error: "Unauthorized." };
  }

  try {
    const validated = provisionSchema.parse(input);
    const result = await provisionOrgUsers({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      rows: validated.rows,
    });
    revalidateUsers();
    return { ok: true, ...result };
  } catch (error) {
    const failure = adminActionFailed(error);
    if (!failure.ok) {
      return failure;
    }
    return { ok: false, error: "Request failed." };
  }
}

export async function adminBulkSetUserAccess(
  input: z.infer<typeof bulkAccessSchema>,
): Promise<
  { ok: true; updated: number; errors: string[] } | { ok: false; error: string }
> {
  const actor = await getAdminActor();
  if (!actor) {
    return { ok: false, error: "Unauthorized." };
  }

  try {
    const validated = bulkAccessSchema.parse(input);
    const result = await bulkSetOrgUserAccess({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userIds: validated.userIds,
      oidcAccountIds: validated.oidcAccountIds,
      netsuiteMcpAccountIds: validated.netsuiteMcpAccountIds,
      orgPersonaIds: validated.orgPersonaIds,
      providerIds: validated.providerIds,
    });
    revalidateUsers();
    return { ok: true, ...result };
  } catch (error) {
    const failure = adminActionFailed(error);
    if (!failure.ok) {
      return failure;
    }
    return { ok: false, error: "Request failed." };
  }
}

export async function adminDeleteUsers(input: {
  userIds: string[];
}): Promise<
  { ok: true; deleted: number; errors: string[] } | { ok: false; error: string }
> {
  const actor = await getAdminActor();
  if (!actor) {
    return { ok: false, error: "Unauthorized." };
  }

  const userIds = [...new Set(input.userIds)].filter(
    (id) => id !== actor.userId,
  );
  const errors: string[] = [];
  let deleted = 0;

  for (const userId of userIds) {
    try {
      await deleteOrgUser({
        orgId: actor.orgId,
        actorUserId: actor.userId,
        userId,
      });
      deleted += 1;
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Could not delete user.",
      );
    }
  }

  revalidateUsers();
  return { ok: true, deleted, errors };
}
