import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  isPersonaBuilderId,
  MAX_CUSTOM_PERSONAS,
  normalizeCustomPersonas,
} from "@/lib/ai/personas/catalog";
import { personaConversionKickoffMessage } from "@/lib/ai/personas/interview";
import type { CustomPersona } from "@/lib/ai/personas/types";
import {
  getChatById,
  getUserSettings,
  saveMessages,
  updateChatPersonaConversion,
  upsertUserSettings,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

const confirmBodySchema = z.object({
  name: z.string().min(1).max(200),
  shortName: z.string().min(1).max(40),
  primaryRole: z.string().max(300).optional(),
  content: z.string().min(1).max(32_000),
  setAsDefault: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: chatId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  if (session.user.type !== "regular") {
    return new ChatSDKError(
      "forbidden:chat",
      "Sign in to save a custom persona.",
    ).toResponse();
  }

  let body: z.infer<typeof confirmBodySchema>;
  try {
    body = confirmBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
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

  // Explicit Save from the UI is authoritative — do not block on tool coverage.
  // Small local models often skip updatePersonaInterview / proposeCustomPersona.

  const settings = await getUserSettings({ userId: session.user.id });
  const customs = normalizeCustomPersonas(settings?.customPersonas);
  const refiningId = chat.refiningPersonaId?.trim() || null;

  const name = body.name.trim();
  const shortName = body.shortName.trim();
  const primaryRole = body.primaryRole?.trim() || undefined;
  const content = body.content.trim();
  const now = new Date().toISOString();

  let nextCustoms: CustomPersona[];
  let savedId: string;

  if (refiningId) {
    const existing = customs.find((p) => p.id === refiningId);
    if (!existing) {
      return NextResponse.json(
        { error: "Persona to refine was not found" },
        { status: 400 },
      );
    }
    savedId = refiningId;
    nextCustoms = customs.map((p) =>
      p.id === refiningId
        ? {
            ...p,
            name,
            shortName,
            ...(primaryRole ? { primaryRole } : { primaryRole: undefined }),
            content,
            updatedAt: now,
          }
        : p,
    );
  } else {
    if (customs.length >= MAX_CUSTOM_PERSONAS) {
      return NextResponse.json(
        { error: "Custom persona limit reached" },
        { status: 400 },
      );
    }
    savedId = generateUUID();
    nextCustoms = [
      ...customs,
      {
        id: savedId,
        name,
        shortName,
        ...(primaryRole ? { primaryRole } : {}),
        content,
        updatedAt: now,
      },
    ];
  }

  // Normalize again so optional primaryRole cleanup is consistent
  nextCustoms = normalizeCustomPersonas(
    nextCustoms.map((p) =>
      p.id === savedId
        ? {
            id: p.id,
            name,
            shortName,
            primaryRole,
            content,
            updatedAt: now,
          }
        : p,
    ),
  );

  const setAsDefault = Boolean(body.setAsDefault);
  await upsertUserSettings({
    userId: session.user.id,
    customPersonas: nextCustoms,
    ...(setAsDefault ? { defaultPersonaId: savedId } : {}),
  });

  await updateChatPersonaConversion({
    chatId,
    personaId: savedId,
    refiningPersonaId: null,
    personaInterview: null,
  });

  const kickoffText = personaConversionKickoffMessage(name);
  const kickoffId = generateUUID();
  await saveMessages({
    messages: [
      {
        chatId,
        id: kickoffId,
        role: "assistant",
        parts: [{ type: "text", text: kickoffText }],
        createdAt: new Date(),
      },
    ],
  });

  const saved = nextCustoms.find((p) => p.id === savedId);

  return NextResponse.json({
    persona: saved,
    personaId: savedId,
    kickoffMessage: {
      id: kickoffId,
      role: "assistant",
      parts: [{ type: "text", text: kickoffText }],
    },
  });
}
