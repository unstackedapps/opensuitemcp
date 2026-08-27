import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user, userRole } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { UserProvisionRow } from "@/lib/org/admin/user-csv";
import {
  createOrgUser,
  deleteOrgUser,
  getOrgUserRole,
  setOrgUserRole,
  setOrgUserStatus,
} from "@/lib/org/admin/users";
import { writeOrgAuditLog } from "@/lib/org/audit";
import { isOrgOwnerRole } from "@/lib/org/types";

export type UserProvisionResult = {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
};

async function getOrgUserIdByEmail(
  orgId: string,
  email: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: user.id })
    .from(userRole)
    .innerJoin(user, eq(userRole.userId, user.id))
    .where(and(eq(userRole.orgId, orgId), eq(user.email, email)))
    .limit(1);

  return row?.id ?? null;
}

async function updateOrgUserProfile({
  userId,
  name,
}: {
  userId: string;
  name: string | null;
}): Promise<void> {
  await db
    .update(user)
    .set({ name: name?.trim() || null })
    .where(eq(user.id, userId));
}

export async function provisionOrgUsers({
  orgId,
  actorUserId,
  actorRole,
  rows,
}: {
  orgId: string;
  actorUserId: string;
  actorRole: "owner" | "admin" | "member";
  rows: UserProvisionRow[];
}): Promise<UserProvisionResult> {
  const result: UserProvisionResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      if (row.action === "delete") {
        const userId = await getOrgUserIdByEmail(orgId, row.email);
        if (!userId) {
          result.errors.push(
            `Line ${row.line}: user not found (${row.email}).`,
          );
          continue;
        }
        if (userId === actorUserId) {
          result.errors.push(`Line ${row.line}: cannot delete your account.`);
          continue;
        }
        await deleteOrgUser({
          orgId,
          actorUserId,
          userId,
        });
        result.deleted += 1;
        continue;
      }

      const existingId = await getOrgUserIdByEmail(orgId, row.email);
      if (!existingId) {
        if (row.role === "owner" && !isOrgOwnerRole(actorRole)) {
          result.errors.push(
            `Line ${row.line}: only owners can create owners.`,
          );
          continue;
        }
        await createOrgUser({
          orgId,
          actorUserId,
          email: row.email,
          name: row.name,
          role: row.role,
          signInMethod: "oidc",
        });
        if (row.disabled) {
          const createdId = await getOrgUserIdByEmail(orgId, row.email);
          if (createdId) {
            await setOrgUserStatus({
              orgId,
              actorUserId,
              userId: createdId,
              status: "disabled",
            });
          }
        }
        result.created += 1;
        continue;
      }

      if (existingId === actorUserId && row.disabled) {
        result.errors.push(`Line ${row.line}: cannot disable your account.`);
        continue;
      }

      await updateOrgUserProfile({ userId: existingId, name: row.name });

      const currentRole = await getOrgUserRole(orgId, existingId);
      if (currentRole && currentRole !== row.role) {
        await setOrgUserRole({
          orgId,
          actorUserId,
          actorRole,
          userId: existingId,
          role: row.role,
        });
      }

      const status = row.disabled ? "disabled" : "active";
      await setOrgUserStatus({
        orgId,
        actorUserId,
        userId: existingId,
        status,
      });

      result.updated += 1;
    } catch (error) {
      const message =
        error instanceof ChatSDKError
          ? typeof error.cause === "string"
            ? error.cause
            : error.message
          : error instanceof Error
            ? error.message
            : "Request failed.";
      result.errors.push(`Line ${row.line}: ${message}`);
    }
  }

  if (result.created > 0 || result.updated > 0 || result.deleted > 0) {
    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "user.provision",
      targetType: "user",
      metadata: {
        created: result.created,
        updated: result.updated,
        deleted: result.deleted,
        errorCount: result.errors.length,
      },
    });
  }

  return result;
}
