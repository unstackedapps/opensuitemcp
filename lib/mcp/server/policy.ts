import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  type OrgMcpServerPolicy,
  orgMcpServerPolicy,
  userAgentAccess,
} from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import {
  DEFAULT_MAX_KEYS_PER_USER,
  type EffectiveMcpPolicy,
  soloMcpPolicy,
  unconfiguredOrgMcpPolicy,
} from "./scopes";

export async function getOrgMcpServerPolicy(
  orgId: string,
): Promise<OrgMcpServerPolicy | null> {
  try {
    const [row] = await db
      .select()
      .from(orgMcpServerPolicy)
      .where(eq(orgMcpServerPolicy.orgId, orgId))
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to read the organization Agent access policy",
    );
  }
}

/**
 * Resolve the policy a user is subject to. Org installs default to disabled so
 * an admin has to opt the organization in before members can mint keys.
 */
export async function resolveMcpPolicy(
  orgId: string | null | undefined,
): Promise<EffectiveMcpPolicy> {
  if (!orgId) {
    return soloMcpPolicy();
  }

  const row = await getOrgMcpServerPolicy(orgId);
  if (!row) {
    return unconfiguredOrgMcpPolicy();
  }

  return {
    enabled: row.enabled,
    memberAccess: row.memberAccess,
    // No user in hand: report the org-wide answer and let the per-user
    // resolver narrow it. Callers acting for a person must use that one.
    memberAllowed: row.memberAccess === "all",
    maxKeysPerUser: row.maxKeysPerUser,
    managedByOrg: true,
  };
}

/**
 * The policy one member is subject to.
 *
 * `resolveMcpPolicy` answers for the organization. When an org narrows Agent
 * access to named members, only this can say whether a given person is one of
 * them, so anything acting for a user — minting a key, authenticating one —
 * must resolve through here.
 */
export async function resolveMcpPolicyForUser(
  orgId: string | null | undefined,
  userId: string,
): Promise<EffectiveMcpPolicy> {
  const policy = await resolveMcpPolicy(orgId);
  if (!orgId || policy.memberAccess === "all") {
    return policy;
  }

  const [row] = await db
    .select({ id: userAgentAccess.id })
    .from(userAgentAccess)
    .where(
      and(eq(userAgentAccess.orgId, orgId), eq(userAgentAccess.userId, userId)),
    )
    .limit(1);

  return { ...policy, memberAllowed: Boolean(row) };
}

export async function listOrgAgentAccessUserIds(
  orgId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: userAgentAccess.userId })
    .from(userAgentAccess)
    .where(eq(userAgentAccess.orgId, orgId));
  return rows.map((row) => row.userId);
}

export async function setOrgAgentAccessUsers(params: {
  orgId: string;
  userIds: string[];
}): Promise<void> {
  const unique = [...new Set(params.userIds)];
  await db
    .delete(userAgentAccess)
    .where(eq(userAgentAccess.orgId, params.orgId));
  if (unique.length > 0) {
    await db
      .insert(userAgentAccess)
      .values(unique.map((userId) => ({ orgId: params.orgId, userId })));
  }
}

export async function upsertOrgMcpServerPolicy(params: {
  orgId: string;
  enabled?: boolean;
  memberAccess?: "all" | "selected";
  maxKeysPerUser?: number;
}): Promise<OrgMcpServerPolicy> {
  const now = new Date();
  try {
    const existing = await getOrgMcpServerPolicy(params.orgId);
    if (!existing) {
      const [created] = await db
        .insert(orgMcpServerPolicy)
        .values({
          orgId: params.orgId,
          enabled: params.enabled ?? false,
          memberAccess: params.memberAccess ?? "all",
          maxKeysPerUser: params.maxKeysPerUser ?? DEFAULT_MAX_KEYS_PER_USER,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return created;
    }

    const [updated] = await db
      .update(orgMcpServerPolicy)
      .set({
        enabled: params.enabled ?? existing.enabled,
        memberAccess: params.memberAccess ?? existing.memberAccess,
        maxKeysPerUser: params.maxKeysPerUser ?? existing.maxKeysPerUser,
        updatedAt: now,
      })
      .where(eq(orgMcpServerPolicy.orgId, params.orgId))
      .returning();
    return updated;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save the organization Agent access policy",
    );
  }
}

export { type EffectiveMcpPolicy, soloMcpPolicy } from "./scopes";
