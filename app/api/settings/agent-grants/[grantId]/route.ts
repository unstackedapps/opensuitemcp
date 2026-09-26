import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { isPersonaAvailableToUser } from "@/lib/mcp/server/agent-personas";
import {
  revokeOAuthGrant,
  updateOAuthGrant,
} from "@/lib/mcp/server/oauth/grants";
import { writeOrgAuditLog } from "@/lib/org/audit";

/**
 * Managing an agent that signed in.
 *
 * The same two operations a key offers — rename, change persona — plus revoke.
 * There is no rotate: a grant's secret is the client's to refresh, and taking
 * it away is what revoke is for.
 */

const patchSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  personaId: z.string().trim().max(128).optional().nullable(),
  netsuiteAccountId: z.string().trim().max(64).optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { grantId } = await params;

  try {
    const parsed = patchSchema.parse(await request.json());

    const requestedPersonaId = parsed.personaId?.trim() || null;
    if (
      requestedPersonaId &&
      !(await isPersonaAvailableToUser(
        { id: session.user.id, orgId: session.user.orgId },
        requestedPersonaId,
      ))
    ) {
      return NextResponse.json(
        { error: "That persona is not available to you." },
        { status: 400 },
      );
    }

    const updated = await updateOAuthGrant({
      userId: session.user.id,
      grantId,
      name: parsed.name,
      personaId:
        parsed.personaId === undefined ? undefined : requestedPersonaId,
      netsuiteAccountId: parsed.netsuiteAccountId,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "No such agent, or it has been revoked." },
        { status: 404 },
      );
    }

    if (session.user.orgId) {
      await writeOrgAuditLog({
        orgId: session.user.orgId,
        actorUserId: session.user.id,
        action: "mcp_oauth.update",
        targetType: "OAuthGrant",
        targetId: grantId,
        metadata: { name: updated.name },
      });
    }

    return NextResponse.json({ grant: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[MCP OAuth] Grant update failed:", error);
    return NextResponse.json(
      { error: "Failed to update the agent" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { grantId } = await params;
  const revoked = await revokeOAuthGrant({ userId: session.user.id, grantId });
  if (!revoked) {
    return NextResponse.json(
      { error: "No such agent, or it was already revoked." },
      { status: 404 },
    );
  }

  if (session.user.orgId) {
    await writeOrgAuditLog({
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "mcp_oauth.revoke",
      targetType: "OAuthGrant",
      targetId: grantId,
    });
  }

  return NextResponse.json({ revoked: true });
}
