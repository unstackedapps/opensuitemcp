import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  listConnectedCatalogSkills,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import { removeConnectedSkillSource } from "@/lib/ai/skills/sync-connected";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import { assertOrgPersonalConnectedSkillsAllowed } from "@/lib/org/enforcement";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sourceId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceId } = await context.params;

  try {
    assertOrgPersonalConnectedSkillsAllowed(session.user.orgId);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Connected skill packs cannot be changed.",
      },
      { status: 403 },
    );
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });
    const skillSettings = normalizeUserSkillSettings(
      settings
        ? {
            enabledSkillIds: settings.enabledSkillIds ?? [],
            customSkills: settings.customSkills ?? [],
            connectedSkillSources: settings.connectedSkillSources ?? [],
          }
        : null,
      settings?.customInstructions,
    );

    const existing = skillSettings.connectedSkillSources.find(
      (source) => source.id === sourceId,
    );
    if (!existing) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    removeConnectedSkillSource(session.user.id, sourceId);

    const nextSources = skillSettings.connectedSkillSources.filter(
      (source) => source.id !== sourceId,
    );
    await upsertUserSettings({
      userId: session.user.id,
      connectedSkillSources: nextSources,
    });

    return NextResponse.json({
      connectedSources: nextSources,
      connectedSkills: listConnectedCatalogSkills(session.user.id, nextSources),
    });
  } catch (error) {
    console.error("[Skills Connected] Disconnect failed:", error);
    return NextResponse.json(
      { error: "Failed to disconnect skills" },
      { status: 500 },
    );
  }
}
