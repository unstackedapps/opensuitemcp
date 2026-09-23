import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  type ConnectedSkillSource,
  listCommunityCatalogSkills,
  listConnectedCatalogSkills,
  listOracleCatalogSkills,
  listSlashableComposerSkills,
  normalizeUserSkillSettings,
} from "@/lib/ai/skills/catalog";
import { getUserSettings } from "@/lib/db/queries";
import {
  listEnabledOrgConnectedSkillSources,
  resolveConnectedSkillsScopeId,
  withLiveSkillCounts,
} from "@/lib/org/connected-skills";
import {
  buildOrgAwareSkillSettings,
  getOrgFilteredSkillCatalog,
  normalizeDisabledOrgConnectedSkillSourceIds,
} from "@/lib/org/enforcement";
import { isOrgInstallMode } from "@/lib/org/install-config";

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
    const userSkillSettings = normalizeUserSkillSettings(
      settings
        ? {
            enabledSkillIds: settings.enabledSkillIds ?? [],
            customSkills: settings.customSkills ?? [],
            connectedSkillSources: settings.connectedSkillSources ?? [],
            skillModes: settings.skillModes ?? {},
          }
        : null,
      settings?.customInstructions,
    );

    const orgManaged = isOrgInstallMode() && Boolean(session.user.orgId);

    let enabledSkillIds = userSkillSettings.enabledSkillIds;
    let customSkills = userSkillSettings.customSkills;
    let connectedSources: ConnectedSourceForClient[] =
      userSkillSettings.connectedSkillSources;
    const disabledOrgConnectedSkillSourceIds =
      normalizeDisabledOrgConnectedSkillSourceIds(
        settings?.disabledOrgConnectedSkillSourceIds,
      );

    if (orgManaged && session.user.orgId) {
      const orgConnected = await listEnabledOrgConnectedSkillSources(
        session.user.orgId,
      );
      const merged = await buildOrgAwareSkillSettings({
        orgId: session.user.orgId,
        enabledSkillIds: userSkillSettings.enabledSkillIds,
        customSkills: userSkillSettings.customSkills,
        connectedSkillSources: userSkillSettings.connectedSkillSources,
        disabledOrgConnectedSkillSourceIds,
      });
      enabledSkillIds = merged.enabledSkillIds;
      customSkills = merged.customSkills;
      connectedSources = orgConnected.map((source) => ({
        ...source,
        userEnabled: !disabledOrgConnectedSkillSourceIds.includes(source.id),
      }));
    }

    const scopeId = resolveConnectedSkillsScopeId(
      session.user.id,
      session.user.orgId,
    );
    const connectedSkills = listConnectedCatalogSkills(
      scopeId,
      connectedSources,
    );
    connectedSources = withLiveSkillCounts(scopeId, connectedSources);

    const catalog =
      orgManaged && session.user.orgId
        ? await getOrgFilteredSkillCatalog(session.user.orgId)
        : [...listOracleCatalogSkills(), ...listCommunityCatalogSkills()];

    const slashableSkills = listSlashableComposerSkills(
      {
        ...userSkillSettings,
        enabledSkillIds,
        customSkills,
        connectedSkillSources: connectedSources,
      },
      {
        oracle: catalog.filter((skill) => skill.source === "oracle"),
        community: catalog.filter((skill) => skill.source === "community"),
        connected: connectedSkills,
        disabledConnectedSourceIds: disabledOrgConnectedSkillSourceIds,
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
        ? disabledOrgConnectedSkillSourceIds
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
