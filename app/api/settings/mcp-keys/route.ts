import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  listPersonasForClient,
  normalizeCustomPersonas,
} from "@/lib/ai/personas/catalog";
import { getUserSettings } from "@/lib/db/queries";
import { getMcpServerUrl } from "@/lib/mcp/server/config";
import {
  countActiveMcpApiKeys,
  createMcpApiKey,
  listMcpApiKeys,
} from "@/lib/mcp/server/keys";
import { resolveMcpPolicyForUser } from "@/lib/mcp/server/policy";
import { writeOrgAuditLog } from "@/lib/org/audit";
import { buildOrgAwarePersonaList } from "@/lib/org/enforcement";
import { isOrgInstallMode } from "@/lib/org/install-config";

const createSchema = z.object({
  name: z.string().trim().min(1).max(128),
  netsuiteAccountId: z.string().trim().max(64).optional().nullable(),
  personaId: z.string().trim().max(128).optional().nullable(),
  expiresInDays: z.number().int().min(1).max(3650).optional().nullable(),
});

/**
 * Personas this user may hand to an agent.
 *
 * The same list their own picker shows, org policy included: a key is the
 * user acting through an agent, so it cannot reach a persona they cannot.
 */
async function personasForUser(user: { id: string; orgId: string | null }) {
  const settings = await getUserSettings({ userId: user.id });
  const customPersonas = settings?.customPersonas ?? [];
  return isOrgInstallMode() && user.orgId
    ? await buildOrgAwarePersonaList(
        user.orgId,
        user.id,
        normalizeCustomPersonas(customPersonas),
      )
    : listPersonasForClient(customPersonas);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = await resolveMcpPolicyForUser(
    session.user.orgId,
    session.user.id,
  );
  const keys = await listMcpApiKeys(session.user.id);
  const personas = await personasForUser({
    id: session.user.id,
    orgId: session.user.orgId,
  });

  return NextResponse.json({
    serverUrl: getMcpServerUrl(request),
    policy,
    keys,
    personas: personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      primaryRole: persona.primaryRole,
      authoredBy: persona.authoredBy ?? "user",
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const policy = await resolveMcpPolicyForUser(
    session.user.orgId,
    session.user.id,
  );
  if (!policy.enabled) {
    return NextResponse.json(
      {
        error:
          "Agent access is disabled for this organization. Ask an administrator to enable it.",
      },
      { status: 403 },
    );
  }

  if (!policy.memberAllowed) {
    return NextResponse.json(
      {
        error:
          "Agent access is limited to selected members of this organization. Ask an administrator to add you.",
      },
      { status: 403 },
    );
  }

  try {
    const parsed = createSchema.parse(await request.json());

    const activeCount = await countActiveMcpApiKeys(session.user.id);
    if (activeCount >= policy.maxKeysPerUser) {
      return NextResponse.json(
        {
          error: `You already have ${activeCount} active keys. Revoke one before creating another.`,
        },
        { status: 409 },
      );
    }

    const requestedPersonaId = parsed.personaId?.trim() || null;
    if (requestedPersonaId) {
      const available = await personasForUser({
        id: session.user.id,
        orgId: session.user.orgId,
      });
      if (!available.some((persona) => persona.id === requestedPersonaId)) {
        return NextResponse.json(
          { error: "That persona is not available to you." },
          { status: 400 },
        );
      }
    }

    const created = await createMcpApiKey({
      userId: session.user.id,
      orgId: session.user.orgId,
      name: parsed.name,
      netsuiteAccountId: parsed.netsuiteAccountId ?? null,
      personaId: requestedPersonaId,
      expiresAt: parsed.expiresInDays
        ? new Date(Date.now() + parsed.expiresInDays * 86_400_000)
        : null,
    });

    if (session.user.orgId) {
      await writeOrgAuditLog({
        orgId: session.user.orgId,
        actorUserId: session.user.id,
        action: "mcp_key.create",
        targetType: "McpApiKey",
        targetId: created.summary.id,
        metadata: { name: created.summary.name },
      });
    }

    return NextResponse.json({
      key: created.summary,
      // The only time the full key is ever returned.
      token: created.token,
      serverUrl: getMcpServerUrl(request),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 },
      );
    }
    console.error("[MCP Keys] Create failed:", error);
    return NextResponse.json(
      { error: "Failed to create the API key" },
      { status: 500 },
    );
  }
}
