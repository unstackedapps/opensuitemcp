import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  listCommunityCatalogSkills,
  listConnectedCatalogSkills,
  listOracleCatalogSkills,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import { getUserSettings } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });
    const userSkillSettings = normalizeUserSkillSettings(
      settings
        ? {
            enabledSkillIds: settings.enabledSkillIds ?? [],
            customSkills: settings.customSkills ?? [],
            connectedSkillSources: settings.connectedSkillSources ?? [],
          }
        : null,
      settings?.customInstructions,
    );

    const connectedSkills = listConnectedCatalogSkills(
      session.user.id,
      userSkillSettings.connectedSkillSources,
    );

    return NextResponse.json({
      catalog: [...listOracleCatalogSkills(), ...listCommunityCatalogSkills()],
      enabledSkillIds: userSkillSettings.enabledSkillIds,
      customSkills: userSkillSettings.customSkills,
      connectedSources: userSkillSettings.connectedSkillSources,
      connectedSkills,
    });
  } catch (error) {
    console.error("[Skills API] Error fetching skills:", error);
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 },
    );
  }
}
