import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  listPersonasForClient,
  normalizeCustomPersonas,
} from "@/lib/ai/personas/catalog";
import { getUserSettings } from "@/lib/db/queries";
import { buildOrgAwarePersonaList } from "@/lib/org/enforcement";
import { isOrgInstallMode } from "@/lib/org/install-config";

/** Builtin + this user's custom personas for the picker. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });
    const customPersonas = normalizeCustomPersonas(settings?.customPersonas);
    const personas =
      isOrgInstallMode() && session.user.orgId
        ? await buildOrgAwarePersonaList(
            session.user.orgId,
            session.user.id,
            customPersonas,
          )
        : listPersonasForClient(customPersonas);
    return NextResponse.json({
      personas,
      hidePersonaPicker: settings?.hidePersonaPicker ?? false,
      defaultPersonaId: settings?.defaultPersonaId ?? null,
    });
  } catch (error) {
    console.error("[Personas API] Error:", error);
    // Still return builtins so the picker is never empty
    return NextResponse.json({
      personas: listPersonasForClient([]),
      hidePersonaPicker: false,
      defaultPersonaId: null,
    });
  }
}
