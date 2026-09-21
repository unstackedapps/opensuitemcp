import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { revokeMcpApiKey } from "@/lib/mcp/server/keys";
import { writeOrgAuditLog } from "@/lib/org/audit";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { keyId } = await params;
  const revoked = await revokeMcpApiKey({ userId: session.user.id, keyId });
  if (!revoked) {
    return NextResponse.json(
      { error: "Key not found or already revoked" },
      { status: 404 },
    );
  }

  if (session.user.orgId) {
    await writeOrgAuditLog({
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "mcp_key.revoke",
      targetType: "McpApiKey",
      targetId: keyId,
    });
  }

  return NextResponse.json({ revoked: true });
}
