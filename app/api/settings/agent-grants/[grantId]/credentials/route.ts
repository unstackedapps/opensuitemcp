import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  readClientCredentialsForGrant,
  rotateClientSecretForGrant,
} from "@/lib/mcp/server/oauth/clients";
import { writeOrgAuditLog } from "@/lib/org/audit";

/**
 * The client ID and secret an agent app issued for itself.
 *
 * GET reads them back, POST replaces the secret in place. Both exist for the
 * same reason the agent key has copy and replace: needing fresh credentials
 * should not mean deleting the app and rebuilding its name, persona, pinned
 * account and history.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { grantId } = await params;
  const credentials = await readClientCredentialsForGrant({
    userId: session.user.id,
    grantId,
  });
  if (!credentials) {
    return NextResponse.json(
      { error: "This agent app has no client credentials." },
      { status: 404 },
    );
  }
  return NextResponse.json(credentials);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { grantId } = await params;
  const rotated = await rotateClientSecretForGrant({
    userId: session.user.id,
    grantId,
  });
  if (!rotated) {
    return NextResponse.json(
      { error: "This agent app has no client credentials." },
      { status: 404 },
    );
  }

  if (session.user.orgId) {
    await writeOrgAuditLog({
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "mcp_oauth.rotate_secret",
      targetType: "OAuthGrant",
      targetId: grantId,
    });
  }

  return NextResponse.json(rotated);
}
