import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { isPersonaAvailableToUser } from "@/lib/mcp/server/agent-personas";
import { revokeMcpApiKey, updateMcpApiKey } from "@/lib/mcp/server/keys";
import { writeOrgAuditLog } from "@/lib/org/audit";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  personaId: z.string().trim().max(128).optional().nullable(),
});

/** Rename an agent or move it to a different persona. The secret is untouched. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    throw error;
  }

  if (parsed.name === undefined && parsed.personaId === undefined) {
    return NextResponse.json(
      { error: "Pass a name or a persona to change." },
      { status: 400 },
    );
  }

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

  const { keyId } = await params;
  const updated = await updateMcpApiKey({
    userId: session.user.id,
    keyId,
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    ...(parsed.personaId === undefined
      ? {}
      : { personaId: requestedPersonaId }),
  });
  if (!updated) {
    return NextResponse.json(
      { error: "Key not found or already revoked" },
      { status: 404 },
    );
  }

  if (session.user.orgId) {
    await writeOrgAuditLog({
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      action: "mcp_key.update",
      targetType: "McpApiKey",
      targetId: keyId,
      metadata: { name: updated.name },
    });
  }

  return NextResponse.json({ key: updated });
}

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
