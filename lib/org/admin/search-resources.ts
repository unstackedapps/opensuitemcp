import "server-only";

import { ChatSDKError } from "@/lib/errors";
import { writeOrgAuditLog } from "@/lib/org/audit";
import {
  createOrgSearchResource,
  deleteOrgSearchResource,
  listOrgSearchResources,
  type OrgSearchResourceRow,
  setOrgSearchResourceEnabled,
  updateOrgSearchResource,
} from "@/lib/org/search-resources";

export type { OrgSearchResourceRow } from "@/lib/org/search-resources";

export async function listAdminOrgSearchResources(
  orgId: string,
): Promise<OrgSearchResourceRow[]> {
  return listOrgSearchResources(orgId);
}

export async function createAdminOrgSearchResource({
  orgId,
  actorUserId,
  label,
  url,
}: {
  orgId: string;
  actorUserId: string;
  label: string;
  url: string;
}): Promise<OrgSearchResourceRow> {
  try {
    const created = await createOrgSearchResource({ orgId, label, url });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "org_search_resource.create",
      targetType: "org_search_resource",
      targetId: created.id,
      metadata: { label: created.label, url: created.url },
    });

    return created;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create search resource.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function updateAdminOrgSearchResource({
  orgId,
  actorUserId,
  resourceId,
  label,
  url,
}: {
  orgId: string;
  actorUserId: string;
  resourceId: string;
  label: string;
  url: string;
}): Promise<OrgSearchResourceRow> {
  try {
    const updated = await updateOrgSearchResource({
      orgId,
      resourceId,
      label,
      url,
    });

    await writeOrgAuditLog({
      orgId,
      actorUserId,
      action: "org_search_resource.update",
      targetType: "org_search_resource",
      targetId: resourceId,
      metadata: { label: updated.label, url: updated.url },
    });

    return updated;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update search resource.";
    throw new ChatSDKError("bad_request:database", message);
  }
}

export async function setAdminOrgSearchResourceEnabled({
  orgId,
  actorUserId,
  resourceId,
  enabled,
}: {
  orgId: string;
  actorUserId: string;
  resourceId: string;
  enabled: boolean;
}): Promise<void> {
  await setOrgSearchResourceEnabled({ orgId, resourceId, enabled });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: enabled
      ? "org_search_resource.enable"
      : "org_search_resource.disable",
    targetType: "org_search_resource",
    targetId: resourceId,
  });
}

export async function deleteAdminOrgSearchResource({
  orgId,
  actorUserId,
  resourceId,
}: {
  orgId: string;
  actorUserId: string;
  resourceId: string;
}): Promise<void> {
  await deleteOrgSearchResource({ orgId, resourceId });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "org_search_resource.delete",
    targetType: "org_search_resource",
    targetId: resourceId,
  });
}
