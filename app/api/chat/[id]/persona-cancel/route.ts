import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { isPersonaBuilderId } from "@/lib/ai/personas/catalog";
import { deleteChatById, getChatById } from "@/lib/db/queries";
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

  await deleteChatById({ id: chatId });

  return NextResponse.json({ ok: true, id: chatId });
}
