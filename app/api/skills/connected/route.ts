import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  listConnectedCatalogSkills,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import { syncConnectedSkillSource } from "@/lib/ai/skills/sync-connected";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";

const connectBodySchema = z.object({
  url: z.string().min(3).max(2048),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof connectBodySchema>;
  try {
    body = connectBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
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

    const { source } = await syncConnectedSkillSource({
      userId: session.user.id,
      url: body.url,
    });

    const nextSources = [...skillSettings.connectedSkillSources, source];
    await upsertUserSettings({
      userId: session.user.id,
      connectedSkillSources: nextSources,
    });

    const connectedSkills = listConnectedCatalogSkills(
      session.user.id,
      nextSources,
    );

    return NextResponse.json({
      source,
      connectedSources: nextSources,
      connectedSkills,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect skills";
    console.error("[Skills Connected] Connect failed:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
