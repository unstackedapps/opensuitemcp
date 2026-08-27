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
  createAdminOrgOidcAccount,
  deleteAdminOrgOidcAccount,
  setAdminOrgOidcAccountEnabled,
  setAdminUserOidcAccess,
  updateAdminOrgOidcAccount,
} from "@/lib/org/admin/oidc-accounts";

const createSchema = z.object({
  accountId: z.string().min(1).max(64),
  clientId: z.string().min(1).max(128),
  name: z.string().max(128).optional(),
});

const oidcAccountIdSchema = z.object({
  oidcAccountId: z.string().uuid(),
});

const enabledSchema = oidcAccountIdSchema.extend({
  enabled: z.boolean(),
});

const updateSchema = oidcAccountIdSchema.extend({
  name: z.string().min(1).max(128),
  clientId: z.string().max(128).optional().nullable(),
});

const userOidcSchema = z.object({
  userId: z.string().uuid(),
  orgOidcAccountIds: z.array(z.string().uuid()),
});

function revalidateNetsuite(): void {
  revalidatePath("/admin/netsuite");
  revalidatePath("/admin/netsuite/oidc");
  revalidatePath("/admin/users");
  revalidatePath("/login");
}

export async function adminCreateOidcAccount(
  input: z.infer<typeof createSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = createSchema.parse(input);
    await createAdminOrgOidcAccount({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      accountId: validated.accountId,
      clientId: validated.clientId,
      name: validated.name,
    });
    revalidateNetsuite();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetOidcAccountEnabled(
  input: z.infer<typeof enabledSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = enabledSchema.parse(input);
    await setAdminOrgOidcAccountEnabled({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      oidcAccountId: validated.oidcAccountId,
      enabled: validated.enabled,
    });
    revalidateNetsuite();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminUpdateOidcAccount(
  input: z.infer<typeof updateSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = updateSchema.parse(input);
    await updateAdminOrgOidcAccount({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      oidcAccountId: validated.oidcAccountId,
      name: validated.name,
      clientId: validated.clientId,
    });
    revalidateNetsuite();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminDeleteOidcAccount(
  input: z.infer<typeof oidcAccountIdSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = oidcAccountIdSchema.parse(input);
    await deleteAdminOrgOidcAccount({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      oidcAccountId: validated.oidcAccountId,
    });
    revalidateNetsuite();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}

export async function adminSetUserOidcAccess(
  input: z.infer<typeof userOidcSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = userOidcSchema.parse(input);
    await setAdminUserOidcAccess({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
      orgOidcAccountIds: validated.orgOidcAccountIds,
    });
    revalidateNetsuite();
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}
