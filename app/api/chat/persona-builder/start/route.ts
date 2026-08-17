import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  MAX_CUSTOM_PERSONAS,
  normalizeCustomPersonas,
  PERSONA_BUILDER_ID,
} from "@/lib/ai/personas/catalog";
import {
  builderChatTitle,
  createInterviewOpener,
  emptyPersonaInterviewState,
} from "@/lib/ai/personas/interview";
import {
  getChatById,
  getUserSettings,
  saveChat,
  saveMessages,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

const bodySchema = z.object({
  chatId: z.string().uuid().optional(),
  refiningPersonaId: z.string().max(64).optional().nullable(),
});

/**
 * Start a persona-builder chat with a seeded assistant opener.
 * Registered users only.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }
  if (session.user.type !== "regular") {
    return new ChatSDKError(
      "forbidden:chat",
      "Sign in to create a persona with the interview.",
    ).toResponse();
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json().catch(() => ({})));
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const settings = await getUserSettings({ userId: session.user.id });
  const customs = normalizeCustomPersonas(settings?.customPersonas);
  const refiningId = body.refiningPersonaId?.trim() || null;
  let refiningName: string | null = null;

  if (refiningId) {
    const target = customs.find((p) => p.id === refiningId);
    if (!target) {
      return NextResponse.json(
        { error: "Unknown persona to refine" },
        { status: 400 },
      );
    }
    refiningName = target.name;
  } else if (customs.length >= MAX_CUSTOM_PERSONAS) {
    return NextResponse.json(
      {
        error:
          "Custom persona limit reached. Delete or refine an existing persona.",
      },
      { status: 400 },
    );
  }

  const chatId = body.chatId?.trim() || generateUUID();
  const existing = await getChatById({ id: chatId });
  if (existing) {
    if (existing.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }
    return NextResponse.json({
      id: chatId,
      alreadyExists: true,
      personaId: existing.personaId,
    });
  }

  const title = builderChatTitle({ refiningName });
  const interview = emptyPersonaInterviewState();

  await saveChat({
    id: chatId,
    userId: session.user.id,
    title,
    summary: null,
    visibility: "private",
    aiProviderId: null,
    personaId: PERSONA_BUILDER_ID,
    refiningPersonaId: refiningId,
    personaInterview: interview,
  });

  const openerText = createInterviewOpener({
    mode: refiningId ? "refine" : "create",
    refiningName,
  });
  const openerId = generateUUID();
  await saveMessages({
    messages: [
      {
        chatId,
        id: openerId,
        role: "assistant",
        parts: [{ type: "text", text: openerText }],
        createdAt: new Date(),
      },
    ],
  });

  return NextResponse.json({
    id: chatId,
    personaId: PERSONA_BUILDER_ID,
    refiningPersonaId: refiningId,
    openerMessageId: openerId,
  });
}
