import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { isPersonaAvailableToUser } from "@/lib/mcp/server/agent-personas";
import {
  deleteRevokedMcpApiKey,
  revokeMcpApiKey,
  updateMcpApiKey,
} from "@/lib/mcp/server/keys";
import { writeOrgAuditLog } from "@/lib/org/audit";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  personaId: z.string().trim().max(128).optional().nullable(),
  description: z.string().trim().max(256).optional().nullable(),
  connectsFrom: z.string().trim().max(64).optional().nullable(),
  netsuiteAccountId: z.string().trim().max(64).optional().nullable(),
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
        {
          // Naming the field is the difference between a person fixing the
          // form and reporting that it does not work.
          error: error.errors[0]
            ? `${error.errors[0].path.join(".") || "request"}: ${error.errors[0].message}`
            : "Invalid request",
          details: error.errors,
        },
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
    // These were parsed and then dropped, so editing a bearer app's note or
    // pinned account saved nothing and reported success.
    ...(parsed.description === undefined
      ? {}
      : { description: parsed.description }),
    ...(parsed.connectsFrom === undefined
      ? {}
      : { connectsFrom: parsed.connectsFrom }),
    ...(parsed.netsuiteAccountId === undefined
      ? {}
      : { netsuiteAccountId: parsed.netsuiteAccountId }),
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

/** Revoke, or — with `?purge=1` on a revoked app — delete for good. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { keyId } = await params;

  if (new URL(request.url).searchParams.get("purge") === "1") {
    const purged = await deleteRevokedMcpApiKey({
      userId: session.user.id,
      keyId,
    });
    if (!purged) {
      return NextResponse.json(
        { error: "No such agent app, or it has not been revoked yet." },
        { status: 404 },
      );
    }
    return NextResponse.json({ deleted: true });
  }

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
