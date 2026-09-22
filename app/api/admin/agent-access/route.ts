import { NextResponse } from "next/server";
import { isMcpServerEnabled } from "@/lib/mcp/server/config";
import { getAdminActor } from "@/lib/org/admin/actor";
import { getAdminAgentAccess } from "@/lib/org/admin/agent-access";
import { listOrgUsers } from "@/lib/org/admin/users";

/**
 * Read model for the Agent access panel.
 *
 * Writes go through the server actions in app/admin/agent-access/actions.ts,
 * which the panel calls directly. This endpoint exists so the same panel can
 * be rendered inside the onboarding wizard, which is a client component and
 * cannot await the page-level loaders.
 */
export async function GET() {
  const actor = await getAdminActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [state, users] = await Promise.all([
    getAdminAgentAccess(actor.orgId),
    listOrgUsers(actor.orgId),
  ]);

  return NextResponse.json({
    serverEnabled: isMcpServerEnabled(),
    state,
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })),
  });
}
