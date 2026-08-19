import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getPersonaContent,
  normalizeCustomPersonas,
} from "@/lib/ai/personas/catalog";
import { getUserSettings } from "@/lib/db/queries";

/** Full markdown body for a builtin or this user's custom persona. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  try {
    const settings = await getUserSettings({ userId: session.user.id });
    const customPersonas = normalizeCustomPersonas(settings?.customPersonas);
    const persona = getPersonaContent(id, customPersonas);
    if (!persona) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }
    return NextResponse.json(persona);
  } catch (error) {
    console.error("[Persona content API] Error:", error);
    return NextResponse.json(
      { error: "Failed to load persona" },
      { status: 500 },
    );
  }
}
