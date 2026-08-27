import "server-only";

import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export async function writeOrgAuditLog({
  orgId,
  actorUserId,
  action,
  targetType,
  targetId,
  metadata = {},
}: {
  orgId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLog).values({
    orgId,
    actorUserId,
    action,
    targetType,
    targetId,
    metadata,
    createdAt: new Date(),
  });
}
