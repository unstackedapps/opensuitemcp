import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  createOAuthUser,
  createUser,
  deleteAllChatsByUserId,
  getUser,
} from "@/lib/db/queries";
import {
  netsuiteToken,
  type OrgRole,
  user,
  userLlmKey,
  userLlmProviderAccess,
  userNetSuiteAccess,
  userNetSuiteMcpAccess,
  userOrgTag,
  userPersonaAccess,
  userRole,
  userSettings,
} from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import { ChatSDKError } from "@/lib/errors";
import { listOrgUserTagsByUserIds } from "@/lib/org/admin/user-tags";
import { writeOrgAuditLog } from "@/lib/org/audit";
import { grantUserAllOrgLlmProviders } from "@/lib/org/llm-providers";
import { grantUserAllOrgNetSuiteMcpAccounts } from "@/lib/org/netsuite-mcp-accounts";
import { grantUserAllOrgOidcAccounts } from "@/lib/org/oidc-accounts";
import { grantUserAllOrgPersonas } from "@/lib/org/personas";
import { assignUserOrgRole } from "@/lib/org/queries";
import { isOrgOwnerRole } from "@/lib/org/types";

export type OrgUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: OrgRole;
  status: "active" | "disabled";
  mustResetPassword: boolean;
  hasPassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  oidcGrantIds: string[];
  netsuiteMcpGrantIds: string[];
  personaGrantIds: string[];
  llmProviderGrantIds: string[];
  tags: string[];
};

export async function listOrgUsers(orgId: string): Promise<OrgUserRow[]> {
  try {
    const rows = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: userRole.role,
        status: user.status,
        mustResetPassword: user.mustResetPassword,
        password: user.password,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      })
      .from(userRole)
      .innerJoin(user, eq(userRole.userId, user.id))
      .where(eq(userRole.orgId, orgId))
      .orderBy(user.email);

    const userIds = rows.map((row) => row.id);
    const oidcGrantIdsByUser = new Map<string, string[]>();
    const netsuiteMcpGrantIdsByUser = new Map<string, string[]>();
    const personaGrantIdsByUser = new Map<string, string[]>();
    const llmProviderGrantIdsByUser = new Map<string, string[]>();

    if (userIds.length > 0) {
      const oidcGrantRows = await db
        .select({
          userId: userNetSuiteAccess.userId,
          netsuiteAccountId: userNetSuiteAccess.netsuiteAccountId,
        })
        .from(userNetSuiteAccess)
        .where(inArray(userNetSuiteAccess.userId, userIds));

      for (const grant of oidcGrantRows) {
        const grants = oidcGrantIdsByUser.get(grant.userId) ?? [];
        grants.push(grant.netsuiteAccountId);
        oidcGrantIdsByUser.set(grant.userId, grants);
      }

      const netsuiteMcpGrantRows = await db
        .select({
          userId: userNetSuiteMcpAccess.userId,
          netsuiteMcpAccountId: userNetSuiteMcpAccess.netsuiteMcpAccountId,
        })
        .from(userNetSuiteMcpAccess)
        .where(inArray(userNetSuiteMcpAccess.userId, userIds));

      for (const grant of netsuiteMcpGrantRows) {
        const grants = netsuiteMcpGrantIdsByUser.get(grant.userId) ?? [];
        grants.push(grant.netsuiteMcpAccountId);
        netsuiteMcpGrantIdsByUser.set(grant.userId, grants);
      }

      const personaGrantRows = await db
        .select({
          userId: userPersonaAccess.userId,
          orgPersonaId: userPersonaAccess.orgPersonaId,
        })
        .from(userPersonaAccess)
        .where(inArray(userPersonaAccess.userId, userIds));

      for (const grant of personaGrantRows) {
        const grants = personaGrantIdsByUser.get(grant.userId) ?? [];
        grants.push(grant.orgPersonaId);
        personaGrantIdsByUser.set(grant.userId, grants);
      }

      const llmProviderGrantRows = await db
        .select({
          userId: userLlmProviderAccess.userId,
          providerId: userLlmProviderAccess.providerId,
        })
        .from(userLlmProviderAccess)
        .where(inArray(userLlmProviderAccess.userId, userIds));

      for (const grant of llmProviderGrantRows) {
        const grants = llmProviderGrantIdsByUser.get(grant.userId) ?? [];
        grants.push(grant.providerId);
        llmProviderGrantIdsByUser.set(grant.userId, grants);
      }
    }

    const tagsByUser = await listOrgUserTagsByUserIds({ orgId, userIds });

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name?.trim() || null,
      role: row.role,
      status: row.status,
      mustResetPassword: row.mustResetPassword,
      hasPassword: Boolean(row.password),
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
      oidcGrantIds: oidcGrantIdsByUser.get(row.id) ?? [],
      netsuiteMcpGrantIds: netsuiteMcpGrantIdsByUser.get(row.id) ?? [],
      personaGrantIds: personaGrantIdsByUser.get(row.id) ?? [],
      llmProviderGrantIds: llmProviderGrantIdsByUser.get(row.id) ?? [],
      tags: tagsByUser.get(row.id) ?? [],
    }));
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list org users");
  }
}

async function countOrgOwners(orgId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userRole)
    .where(and(eq(userRole.orgId, orgId), eq(userRole.role, "owner")));

  return row?.count ?? 0;
}

export async function getOrgUserRole(
  orgId: string,
  userId: string,
): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: userRole.role })
    .from(userRole)
    .where(and(eq(userRole.orgId, orgId), eq(userRole.userId, userId)))
    .limit(1);

  return row?.role ?? null;
}

async function assertNotLastOwner({
  orgId,
  userId,
}: {
  orgId: string;
  userId: string;
}): Promise<void> {
  const role = await getOrgUserRole(orgId, userId);
  if (role !== "owner") {
    return;
  }

  const ownerCount = await countOrgOwners(orgId);
  if (ownerCount <= 1) {
    throw new ChatSDKError(
      "bad_request:database",
      "Cannot remove the only org owner.",
    );
  }
}

export async function createOrgUser({
  orgId,
  actorUserId,
  email,
  name,
  password,
  role,
  signInMethod,
}: {
  orgId: string;
  actorUserId: string;
  email: string;
  name?: string | null;
  password?: string;
  role: OrgRole;
  signInMethod: "basic" | "oidc";
}): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await getUser(normalizedEmail);
  if (existing.length > 0) {
    throw new ChatSDKError("bad_request:database", "User already exists.");
  }

  if (signInMethod === "basic") {
    const trimmedPassword = password?.trim() ?? "";
    if (trimmedPassword.length < 6) {
      throw new ChatSDKError(
        "bad_request:database",
        "Password must be at least 6 characters.",
      );
    }
    await createUser(normalizedEmail, trimmedPassword);
  } else {
    await createOAuthUser(normalizedEmail);
  }

  const [created] = await getUser(normalizedEmail);
  if (!created) {
    throw new ChatSDKError("bad_request:database", "Failed to create user.");
  }

  const trimmedName = name?.trim();
  if (trimmedName) {
    await db
      .update(user)
      .set({ name: trimmedName })
      .where(eq(user.id, created.id));
  }

  await assignUserOrgRole({
    userId: created.id,
    orgId,
    role,
  });

  if (signInMethod === "basic") {
    await db
      .update(user)
      .set({ mustResetPassword: true })
      .where(eq(user.id, created.id));
  }

  await grantUserAllOrgOidcAccounts({ userId: created.id, orgId });
  await grantUserAllOrgNetSuiteMcpAccounts({ userId: created.id, orgId });
  await grantUserAllOrgPersonas({ userId: created.id, orgId });
  await grantUserAllOrgLlmProviders({ userId: created.id, orgId });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.create",
    targetType: "user",
    targetId: created.id,
    metadata: { email: normalizedEmail, role, signInMethod },
  });
}

export async function updateOrgUserProfile({
  orgId,
  actorUserId,
  userId,
  name,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
  name: string | null;
}): Promise<void> {
  const role = await getOrgUserRole(orgId, userId);
  if (!role) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  await db
    .update(user)
    .set({ name: name?.trim() || null })
    .where(eq(user.id, userId));

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.profile_update",
    targetType: "user",
    targetId: userId,
  });
}

export async function setOrgUserStatus({
  orgId,
  actorUserId,
  userId,
  status,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
  status: "active" | "disabled";
}): Promise<void> {
  if (userId === actorUserId && status === "disabled") {
    throw new ChatSDKError(
      "bad_request:database",
      "Cannot disable your account.",
    );
  }

  if (status === "disabled") {
    await assertNotLastOwner({ orgId, userId });
  }

  const role = await getOrgUserRole(orgId, userId);
  if (!role) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  await db.update(user).set({ status }).where(eq(user.id, userId));

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: status === "disabled" ? "user.disable" : "user.enable",
    targetType: "user",
    targetId: userId,
  });
}

export async function setOrgUserRole({
  orgId,
  actorUserId,
  actorRole,
  userId,
  role,
}: {
  orgId: string;
  actorUserId: string;
  actorRole: OrgRole;
  userId: string;
  role: OrgRole;
}): Promise<void> {
  const currentRole = await getOrgUserRole(orgId, userId);
  if (!currentRole) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  if (role === "owner" && !isOrgOwnerRole(actorRole)) {
    throw new ChatSDKError("forbidden:api", "Only owners can assign owner.");
  }

  if (currentRole === "owner" && !isOrgOwnerRole(actorRole)) {
    throw new ChatSDKError("forbidden:api", "Cannot change an owner role.");
  }

  if (userId === actorUserId && currentRole === "owner" && role !== "owner") {
    await assertNotLastOwner({ orgId, userId });
  }

  if (currentRole === "owner" && role !== "owner") {
    await assertNotLastOwner({ orgId, userId });
  }

  await assignUserOrgRole({ userId, orgId, role });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.role_change",
    targetType: "user",
    targetId: userId,
    metadata: { from: currentRole, to: role },
  });
}

export async function requireOrgUserPasswordReset({
  orgId,
  actorUserId,
  userId,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
}): Promise<void> {
  const role = await getOrgUserRole(orgId, userId);
  if (!role) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  await db
    .update(user)
    .set({ mustResetPassword: true })
    .where(eq(user.id, userId));

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.force_password_reset",
    targetType: "user",
    targetId: userId,
  });
}

export async function setOrgUserSignInMethod({
  orgId,
  actorUserId,
  userId,
  signInMethod,
  password,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
  signInMethod: "basic" | "oidc";
  password?: string;
}): Promise<void> {
  const role = await getOrgUserRole(orgId, userId);
  if (!role) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  const [row] = await db
    .select({ password: user.password })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) {
    throw new ChatSDKError("bad_request:database", "User not found.");
  }

  if (signInMethod === "oidc") {
    await db
      .update(user)
      .set({ password: null, mustResetPassword: false })
      .where(eq(user.id, userId));
  } else {
    const trimmedPassword = password?.trim() ?? "";
    if (trimmedPassword.length < 6) {
      throw new ChatSDKError(
        "bad_request:database",
        "Password must be at least 6 characters.",
      );
    }
    await db
      .update(user)
      .set({
        password: generateHashedPassword(trimmedPassword),
        mustResetPassword: true,
      })
      .where(eq(user.id, userId));
  }

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.sign_in_method",
    targetType: "user",
    targetId: userId,
    metadata: { signInMethod },
  });
}

export async function deleteOrgUser({
  orgId,
  actorUserId,
  userId,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
}): Promise<void> {
  if (userId === actorUserId) {
    throw new ChatSDKError(
      "bad_request:database",
      "Cannot delete your account.",
    );
  }

  await assertNotLastOwner({ orgId, userId });

  const role = await getOrgUserRole(orgId, userId);
  if (!role) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  const [target] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  await db
    .delete(userNetSuiteMcpAccess)
    .where(eq(userNetSuiteMcpAccess.userId, userId));
  await db
    .delete(userPersonaAccess)
    .where(eq(userPersonaAccess.userId, userId));
  await db
    .delete(userNetSuiteAccess)
    .where(eq(userNetSuiteAccess.userId, userId));
  await db
    .delete(userLlmProviderAccess)
    .where(eq(userLlmProviderAccess.userId, userId));
  await db.delete(userOrgTag).where(eq(userOrgTag.userId, userId));
  await db.delete(userLlmKey).where(eq(userLlmKey.userId, userId));
  await db.delete(netsuiteToken).where(eq(netsuiteToken.userId, userId));
  await db.delete(userSettings).where(eq(userSettings.userId, userId));
  await deleteAllChatsByUserId({ userId });
  await db
    .delete(userRole)
    .where(and(eq(userRole.orgId, orgId), eq(userRole.userId, userId)));
  await db.delete(user).where(eq(user.id, userId));

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.delete",
    targetType: "user",
    targetId: userId,
    metadata: { email: target?.email ?? null },
  });
}
