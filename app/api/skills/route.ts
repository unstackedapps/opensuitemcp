import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  type CatalogSkill,
  type ConnectedSkillSource,
  listSlashableComposerSkills,
} from "@/lib/ai/skills/catalog";
import { buildUserSkillContext } from "@/lib/ai/skills/user-surface";
import { getUserSettings } from "@/lib/db/queries";
import { withLiveSkillCounts } from "@/lib/org/connected-skills";

type ConnectedSourceForClient = ConnectedSkillSource & {
  userEnabled?: boolean;
};

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });
    const {
      userSkillSettings,
      enabledSkillIds,
      customSkills,
      connectedSkillSources,
      disabledConnectedSourceIds,
      catalog,
      connectedSkills,
      scopeId,
      orgManaged,
    } = await buildUserSkillContext({
      userId: session.user.id,
      orgId: session.user.orgId ?? null,
      settings: settings ?? {},
      disabledOrgConnectedSkillSourceIds:
        settings?.disabledOrgConnectedSkillSourceIds,
    });

    // The UI needs to render an org source the user switched off, so it carries
    // the flag rather than dropping the row.
    const connectedSources: ConnectedSourceForClient[] = withLiveSkillCounts(
      scopeId,
      connectedSkillSources,
    ).map((source) =>
      orgManaged
        ? {
            ...source,
            userEnabled: !disabledConnectedSourceIds.includes(source.id),
          }
        : source,
    );

    const slashableSkills = listSlashableComposerSkills(
      {
        ...userSkillSettings,
        enabledSkillIds,
        customSkills,
        connectedSkillSources: connectedSources,
      },
      {
        oracle: catalog.filter(
          (skill: CatalogSkill) => skill.source === "oracle",
        ),
        community: catalog.filter(
          (skill: CatalogSkill) => skill.source === "community",
        ),
        connected: connectedSkills,
        disabledConnectedSourceIds,
      },
    );

    return NextResponse.json({
      catalog,
      enabledSkillIds,
      skillModes: userSkillSettings.skillModes,
      customSkills,
      connectedSources,
      connectedSkills,
      slashableSkills,
      disabledOrgConnectedSkillSourceIds: orgManaged
        ? disabledConnectedSourceIds
        : undefined,
      orgSkillsPolicy: orgManaged ? { managedByOrg: true } : undefined,
    });
  } catch (error) {
    console.error("[Skills API] Error fetching skills:", error);
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 },
    );
  }
}
