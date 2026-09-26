import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  disableManualOAuthClient,
  revealManualOAuthClientSecret,
} from "@/lib/mcp/server/oauth/clients";
import { writeOrgAuditLog } from "@/lib/org/audit";

/**
 * Reading back or removing a hand-made OAuth client.
 *
 * The secret is stored encrypted as well as hashed so it can be copied again,
 * for the same reason an agent key can: a connector asks for it long after the
 * dialog that first showed it has gone, and re-creating the client to see it
 * again would break whatever is already using the old one.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await params;
  const secret = await revealManualOAuthClientSecret({
    userId: session.user.id,
    id: clientId,
  });
  if (!secret) {
    return NextResponse.json(
      { error: "No such client, or its secret cannot be recovered." },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { clientSecret: secret },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await params;
  const removed = await disableManualOAuthClient({
    userId: session.user.id,
    id: clientId,
  });
  if (!removed) {
    return NextResponse.json(
      { error: "No such client, or it was already removed." },
      { status: 404 },
    );
  }

  if (session.user.orgId) {
    await writeOrgAuditLog({
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "mcp_oauth.client_remove",
      targetType: "OAuthClient",
      targetId: clientId,
    });
  }

  return NextResponse.json({ removed: true });
}
