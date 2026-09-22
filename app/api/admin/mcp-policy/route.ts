import { NextResponse } from "next/server";
import { z } from "zod";
import { isMcpServerEnabled } from "@/lib/mcp/server/config";
import {
  resolveMcpPolicy,
  upsertOrgMcpServerPolicy,
} from "@/lib/mcp/server/policy";
import { getAdminActor } from "@/lib/org/admin/actor";
import { writeOrgAuditLog } from "@/lib/org/audit";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  allowWriteScope: z.boolean().optional(),
  maxKeysPerUser: z.number().int().min(1).max(100).optional(),
});

export async function GET() {
  const actor = await getAdminActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = await resolveMcpPolicy(actor.orgId);
  return NextResponse.json({ serverEnabled: isMcpServerEnabled(), policy });
}

export async function POST(request: Request) {
  const actor = await getAdminActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = patchSchema.parse(await request.json());
    const saved = await upsertOrgMcpServerPolicy({
      orgId: actor.orgId,
      ...parsed,
    });

    await writeOrgAuditLog({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      action: "mcp_policy.update",
      targetType: "OrgMcpServerPolicy",
      targetId: saved.id,
      metadata: { ...parsed },
    });

    return NextResponse.json({
      policy: {
        enabled: saved.enabled,
        allowWriteScope: saved.allowWriteScope,
        maxKeysPerUser: saved.maxKeysPerUser,
        managedByOrg: true,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[MCP Policy] Update failed:", error);
    return NextResponse.json(
      { error: "Failed to save the policy" },
      { status: 500 },
    );
  }
}
