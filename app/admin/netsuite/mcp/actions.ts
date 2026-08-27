"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type AdminActionResult,
  adminActionError,
  adminActionUnauthorized,
} from "@/lib/org/admin/action-result";
import { getAdminActor } from "@/lib/org/admin/actor";
import { setAdminOrgMcpDisabledToolNames } from "@/lib/org/admin/mcp-tool-policy";
import {
  createAdminOrgNetSuiteMcpAccount,
  deleteAdminOrgNetSuiteMcpAccount,
  setAdminOrgNetSuiteMcpAccountEnabled,
  setAdminUserNetSuiteMcpAccess,
  updateAdminOrgNetSuiteMcpAccountName,
} from "@/lib/org/admin/netsuite-mcp-accounts";
import {
  type AdminNetSuiteMcpProbeResult,
  probeAdminOrgNetSuiteMcpAccount,
  startAdminOrgNetSuiteMcpTestConnect,
} from "@/lib/org/admin/netsuite-mcp-verify";

const createSchema = z.object({
  accountId: z.string().min(1).max(64),
  name: z.string().max(128).optional(),
});

const netsuiteMcpAccountIdSchema = z.object({
  netsuiteMcpAccountId: z.string().uuid(),
});

const testConnectSchema = netsuiteMcpAccountIdSchema.extend({
  returnPath: z.string().max(512).optional(),
});

const enabledSchema = netsuiteMcpAccountIdSchema.extend({
  enabled: z.boolean(),
});

const nameSchema = netsuiteMcpAccountIdSchema.extend({
  name: z.string().min(1).max(128),
});

const userMcpSchema = z.object({
  userId: z.string().uuid(),
  netsuiteMcpAccountIds: z.array(z.string().uuid()),
});

const mcpToolsSchema = netsuiteMcpAccountIdSchema.extend({
  disabledNames: z.array(z.string().max(256)).max(256),
});

function revalidateNetSuiteMcp(): void {
  revalidatePath("/admin/netsuite");
  revalidatePath("/admin/netsuite/mcp");
  revalidatePath("/onboarding");
  revalidatePath("/admin/users");
  revalidatePath("/");
}

export async function adminCreateNetSuiteMcpAccount(
  input: z.infer<typeof createSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = createSchema.parse(input);
    await createAdminOrgNetSuiteMcpAccount({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      accountId: validated.accountId,
      name: validated.name,
    });
    revalidateNetSuiteMcp();
    return { ok: true };
  } catch (error) {
    return adminActionError(error);
  }
}

export async function adminSetNetSuiteMcpAccountEnabled(
  input: z.infer<typeof enabledSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = enabledSchema.parse(input);
    await setAdminOrgNetSuiteMcpAccountEnabled({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      netsuiteMcpAccountId: validated.netsuiteMcpAccountId,
      enabled: validated.enabled,
    });
    revalidateNetSuiteMcp();
    return { ok: true };
  } catch (error) {
    return adminActionError(error);
  }
}

export async function adminDeleteNetSuiteMcpAccount(
  input: z.infer<typeof netsuiteMcpAccountIdSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = netsuiteMcpAccountIdSchema.parse(input);
    await deleteAdminOrgNetSuiteMcpAccount({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      netsuiteMcpAccountId: validated.netsuiteMcpAccountId,
    });
    revalidateNetSuiteMcp();
    return { ok: true };
  } catch (error) {
    return adminActionError(error);
  }
}

export async function adminUpdateNetSuiteMcpAccountName(
  input: z.infer<typeof nameSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = nameSchema.parse(input);
    await updateAdminOrgNetSuiteMcpAccountName({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      netsuiteMcpAccountId: validated.netsuiteMcpAccountId,
      name: validated.name,
    });
    revalidateNetSuiteMcp();
    return { ok: true };
  } catch (error) {
    return adminActionError(error);
  }
}

export async function adminProbeNetSuiteMcpAccount(
  input: z.infer<typeof netsuiteMcpAccountIdSchema>,
): Promise<
  | { ok: true; result: AdminNetSuiteMcpProbeResult }
  | { ok: false; error: string }
> {
  const actor = await getAdminActor();
  if (!actor) {
    return { ok: false, error: "Unauthorized." };
  }

  try {
    const validated = netsuiteMcpAccountIdSchema.parse(input);
    const result = await probeAdminOrgNetSuiteMcpAccount({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      netsuiteMcpAccountId: validated.netsuiteMcpAccountId,
    });
    revalidateNetSuiteMcp();
    return { ok: true, result };
  } catch (error) {
    return adminActionError(error);
  }
}

export async function adminStartNetSuiteMcpTestConnect(
  input: z.infer<typeof testConnectSchema>,
): Promise<{ ok: true; authorizeUrl: string } | { ok: false; error: string }> {
  const actor = await getAdminActor();
  if (!actor) {
    return { ok: false, error: "Unauthorized." };
  }

  try {
    const validated = testConnectSchema.parse(input);
    const { authorizeUrl } = await startAdminOrgNetSuiteMcpTestConnect({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      netsuiteMcpAccountId: validated.netsuiteMcpAccountId,
      returnPath: validated.returnPath,
    });
    return { ok: true, authorizeUrl };
  } catch (error) {
    return adminActionError(error);
  }
}

export async function adminSetUserNetSuiteMcpAccess(
  input: z.infer<typeof userMcpSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = userMcpSchema.parse(input);
    await setAdminUserNetSuiteMcpAccess({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      userId: validated.userId,
      netsuiteMcpAccountIds: validated.netsuiteMcpAccountIds,
    });
    revalidateNetSuiteMcp();
    return { ok: true };
  } catch (error) {
    return adminActionError(error);
  }
}

export async function adminSetOrgMcpDisabledToolNames(
  input: z.infer<typeof mcpToolsSchema>,
): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }

  try {
    const validated = mcpToolsSchema.parse(input);
    await setAdminOrgMcpDisabledToolNames({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      netsuiteMcpAccountId: validated.netsuiteMcpAccountId,
      disabledNames: validated.disabledNames,
    });
    revalidateNetSuiteMcp();
    return { ok: true };
  } catch (error) {
    return adminActionError(error);
  }
}
