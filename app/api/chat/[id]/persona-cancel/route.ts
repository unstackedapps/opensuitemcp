import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  AVA_PERSONA_ID,
  isDefaultablePersonaId,
  isPersonaBuilderId,
  normalizeCustomPersonas,
} from "@/lib/ai/personas/catalog";
import {
  getChatById,
  getUserSettings,
  updateChatPersonaConversion,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: chatId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id: chatId });
  if (!chat) {
    return new ChatSDKError("not_found:chat").toResponse();
  }
  if (chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }
  if (!isPersonaBuilderId(chat.personaId)) {
    return NextResponse.json(
      { error: "Chat is not in persona interview mode" },
      { status: 400 },
    );
  }

  const settings = await getUserSettings({ userId: session.user.id });
  const customs = normalizeCustomPersonas(settings?.customPersonas);
  const def = settings?.defaultPersonaId?.trim() || null;
  let nextPersonaId: string | null = null;
  if (def && isDefaultablePersonaId(def, customs) && def !== AVA_PERSONA_ID) {
    nextPersonaId = def;
  }

  await updateChatPersonaConversion({
    chatId,
    personaId: nextPersonaId,
    refiningPersonaId: null,
    personaInterview: null,
  });

  return NextResponse.json({
    personaId: nextPersonaId,
  });
}
