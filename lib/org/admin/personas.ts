import "server-only";

import { ChatSDKError } from "@/lib/errors";
import { getOrgUserRole } from "@/lib/org/admin/users";
import { writeOrgAuditLog } from "@/lib/org/audit";
import {
  listOrgPersonasForAdmin,
  setOrgPersonaEnabled,
  setUserPersonaAccess,
} from "@/lib/org/personas";

export type AdminOrgPersonaRow = Awaited<
  ReturnType<typeof listOrgPersonasForAdmin>
>[number];

export async function listAdminOrgPersonas(
  orgId: string,
): Promise<AdminOrgPersonaRow[]> {
  return listOrgPersonasForAdmin(orgId);
}

export async function setAdminOrgPersonaEnabled({
  orgId,
  actorUserId,
  personaId,
  enabled,
}: {
  orgId: string;
  actorUserId: string;
  personaId: string;
  enabled: boolean;
}): Promise<void> {
  await setOrgPersonaEnabled({ orgId, personaId, enabled });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: enabled ? "persona.enable" : "persona.disable",
    targetType: "persona",
    targetId: personaId,
  });
}

export async function setAdminUserPersonaAccess({
  orgId,
  actorUserId,
  userId,
  orgPersonaIds,
}: {
  orgId: string;
  actorUserId: string;
  userId: string;
  orgPersonaIds: string[];
}): Promise<void> {
  const role = await getOrgUserRole(orgId, userId);
  if (!role) {
    throw new ChatSDKError("bad_request:database", "User not in organization.");
  }

  await setUserPersonaAccess({
    userId,
    orgId,
    orgPersonaIds,
  });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "user.persona_access_update",
    targetType: "user",
    targetId: userId,
    metadata: { orgPersonaIds },
  });
}
