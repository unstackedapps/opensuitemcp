import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { type OrgMcpServerPolicy, orgMcpServerPolicy } from "@/lib/db/schema";
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
      "Failed to read the organization MCP server policy",
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
    allowWriteScope: row.allowWriteScope,
    maxKeysPerUser: row.maxKeysPerUser,
    managedByOrg: true,
  };
}

export async function upsertOrgMcpServerPolicy(params: {
  orgId: string;
  enabled?: boolean;
  allowWriteScope?: boolean;
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
          allowWriteScope: params.allowWriteScope ?? false,
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
        allowWriteScope: params.allowWriteScope ?? existing.allowWriteScope,
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
      "Failed to save the organization MCP server policy",
    );
  }
}

export {
  applyScopePolicy,
  type EffectiveMcpPolicy,
  soloMcpPolicy,
} from "./scopes";
