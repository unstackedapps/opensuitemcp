import "server-only";

import { writeOrgAuditLog } from "@/lib/org/audit";
import { setOrgMcpDisabledToolNames } from "@/lib/org/mcp-tool-policy";

export async function setAdminOrgMcpDisabledToolNames({
  orgId,
  actorUserId,
  netsuiteMcpAccountId,
  disabledNames,
}: {
  orgId: string;
  actorUserId: string;
  netsuiteMcpAccountId: string;
  disabledNames: string[];
}): Promise<void> {
  await setOrgMcpDisabledToolNames({
    orgId,
    netsuiteMcpAccountId,
    disabledNames,
  });

  await writeOrgAuditLog({
    orgId,
    actorUserId,
    action: "netsuite_mcp.tools_update",
    targetType: "netsuite_mcp_account",
    targetId: netsuiteMcpAccountId,
    metadata: { disabledCount: disabledNames.length },
  });
}
