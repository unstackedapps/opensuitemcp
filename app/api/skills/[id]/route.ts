import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getCommunitySkillContent,
  getConnectedSkillContent,
  getOracleSkillContent,
  listCommunityCatalogSkills,
  listConnectedCatalogSkills,
  listOracleCatalogSkills,
  normalizeUserSkillSettings,
  parseConnectedSkillId,
} from "@/lib/ai/skills/catalog";
import { getUserSettings } from "@/lib/db/queries";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await context.params;
  const id = decodeURIComponent(rawId);

  if (id.startsWith("community:")) {
    const meta = listCommunityCatalogSkills().find((skill) => skill.id === id);
    const content = getCommunitySkillContent(id);
    if (!meta || content === null) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: meta.id,
      name: meta.name,
      content,
    });
  }

  if (id.startsWith("connected:")) {
    const parsed = parseConnectedSkillId(id);
    if (!parsed) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
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
    const ownsSource = userSkillSettings.connectedSkillSources.some(
      (source) => source.id === parsed.sourceId,
    );
    if (!ownsSource) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    const meta = listConnectedCatalogSkills(
      session.user.id,
      userSkillSettings.connectedSkillSources,
    ).find((skill) => skill.id === id);
    const content = getConnectedSkillContent(session.user.id, id);
    if (!meta || content === null) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: meta.id,
      name: meta.name,
      content,
    });
  }

  const meta = listOracleCatalogSkills().find((skill) => skill.id === id);
  const content = getOracleSkillContent(id);

  if (!meta || content === null) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: meta.id,
    name: meta.name,
    content,
  });
}
