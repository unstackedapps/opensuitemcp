import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getMcpServerUrl } from "@/lib/mcp/server/config";
import { rotateMcpApiKey } from "@/lib/mcp/server/keys";
import { resolveMcpPolicyForUser } from "@/lib/mcp/server/policy";
import { writeOrgAuditLog } from "@/lib/org/audit";

/**
 * Replace an agent's secret, keeping the agent.
 *
 * Gated on the same policy as minting: an organization that has switched Agent
 * access off, or narrowed it away from this member, should not have a live
 * credential re-issued out from under it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = await resolveMcpPolicyForUser(
    session.user.orgId,
    session.user.id,
  );
  if (!(policy.enabled && policy.memberAllowed)) {
    return NextResponse.json(
      {
        error:
          "Agent access is not available to you. Ask an administrator to enable it.",
      },
      { status: 403 },
    );
  }

  const { keyId } = await params;
  const rotated = await rotateMcpApiKey({ userId: session.user.id, keyId });
  if (!rotated) {
    return NextResponse.json(
      { error: "Key not found or already revoked" },
      { status: 404 },
    );
  }

  if (session.user.orgId) {
    await writeOrgAuditLog({
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "mcp_key.rotate",
      targetType: "McpApiKey",
      targetId: keyId,
      metadata: { name: rotated.summary.name },
    });
  }

  return NextResponse.json({
    key: rotated.summary,
    // The only time the new secret is ever returned, as at mint.
    token: rotated.token,
    serverUrl: getMcpServerUrl(request),
  });
}
