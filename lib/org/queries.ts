import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { type Org, type OrgRole, org, userRole } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { DEFAULT_ORG_NAME, type UserOrgContext } from "./types";

export async function getDefaultOrg(): Promise<Org | null> {
  try {
    const [result] = await db.select().from(org).limit(1);
    return result ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get default org");
  }
}

export async function ensureDefaultOrg(): Promise<Org> {
  const existing = await getDefaultOrg();
  if (existing) {
    return existing;
  }

  try {
    const [created] = await db
      .insert(org)
      .values({
        name: DEFAULT_ORG_NAME,
        createdAt: new Date(),
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create default org");
    }

    return created;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to ensure default org",
    );
  }
}

export async function getUserOrgContext(
  userId: string,
): Promise<UserOrgContext | null> {
  try {
    const [row] = await db
      .select({
        orgId: userRole.orgId,
        role: userRole.role,
      })
      .from(userRole)
      .where(eq(userRole.userId, userId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      orgId: row.orgId,
      role: row.role,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user org context",
    );
  }
}

export async function assignUserOrgRole({
  userId,
  orgId,
  role,
}: {
  userId: string;
  orgId: string;
  role: OrgRole;
}): Promise<void> {
  try {
    await db
      .insert(userRole)
      .values({
        userId,
        orgId,
        role,
      })
      .onConflictDoUpdate({
        target: [userRole.userId, userRole.orgId],
        set: { role },
      });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to assign user org role",
    );
  }
}

export async function assignUserToDefaultOrgMember(
  userId: string,
): Promise<void> {
  if (!isOrgInstallMode()) {
    return;
  }

  const existing = await getUserOrgContext(userId);
  if (existing) {
    return;
  }

  const defaultOrg = await ensureDefaultOrg();
  await assignUserOrgRole({
    userId,
    orgId: defaultOrg.id,
    role: "member",
  });
}

export async function hasOrgOwner(orgId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ userId: userRole.userId })
      .from(userRole)
      .where(and(eq(userRole.orgId, orgId), eq(userRole.role, "owner")))
      .limit(1);

    return Boolean(row);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to check org owner");
  }
}

export { promoteUserToOwnerByEmail } from "./promote-root-email";
