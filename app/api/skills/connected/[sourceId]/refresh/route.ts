import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  listConnectedCatalogSkills,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import { syncConnectedSkillSource } from "@/lib/ai/skills/sync-connected";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sourceId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceId } = await context.params;

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
      (item) => item.id === sourceId,
    );
    if (!existing) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    const { source } = await syncConnectedSkillSource({
      userId: session.user.id,
      url: existing.url,
      existing,
    });

    const nextSources = skillSettings.connectedSkillSources.map((item) =>
      item.id === sourceId ? source : item,
    );
    await upsertUserSettings({
      userId: session.user.id,
      connectedSkillSources: nextSources,
    });

    if (source.lastError) {
      return NextResponse.json(
        {
          error: source.lastError,
          source,
          connectedSources: nextSources,
          connectedSkills: listConnectedCatalogSkills(
            session.user.id,
            nextSources,
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      source,
      connectedSources: nextSources,
      connectedSkills: listConnectedCatalogSkills(session.user.id, nextSources),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to refresh skills";
    console.error("[Skills Connected] Refresh failed:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
