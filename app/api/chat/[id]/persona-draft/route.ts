import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  extractPersonaPlaybookDraft,
  interviewTranscriptFromMessages,
  looksLikePersonaPlaybook,
  PERSONA_PLAYBOOK_WRITER_PROMPT,
  parsePlaybookDraft,
} from "@/lib/ai/personas/draft";
import { isPersonaBuilderId } from "@/lib/ai/personas/ids";
import { getUserProvider } from "@/lib/ai/providers";
import { resolveUserChatProvider } from "@/lib/ai/resolve-user-chat-provider";
import {
  getChatById,
  getMessagesByChatId,
  getUserSettings,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { convertToUIMessages } from "@/lib/utils";

export const maxDuration = 60;

const bodySchema = z.object({
  selectedChatModel: z.enum(["chat-model", "chat-model-reasoning"]).optional(),
  transcript: z.string().max(32_000).optional(),
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

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json().catch(() => ({})));
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

  const dbMessages = await getMessagesByChatId({ id: chatId });
  const uiMessages = convertToUIMessages(dbMessages);
  const existing = extractPersonaPlaybookDraft(uiMessages);
  if (existing) {
    return NextResponse.json(existing);
  }

  const transcript =
    body.transcript?.trim() || interviewTranscriptFromMessages(uiMessages);
  if (transcript.trim().length < 40) {
    return NextResponse.json(
      {
        error:
          "Interview is too short to draft a persona. Answer a few more questions first.",
      },
      { status: 400 },
    );
  }

  const settings = await getUserSettings({ userId: session.user.id });
  const resolved = resolveUserChatProvider({
    chatAiProviderId: chat.aiProviderId,
    settings,
  });
  if (resolved.dangling) {
    return NextResponse.json(
      {
        error:
          "This chat's AI provider was removed. Pick another provider in the chat header.",
      },
      { status: 400 },
    );
  }
  if (resolved.missing || !resolved.type) {
    return NextResponse.json(
      { error: "API key is required. Please set your API key in Settings." },
      { status: 400 },
    );
  }

  const modelId = body.selectedChatModel ?? "chat-model";
  const provider = getUserProvider(resolved.apiKey, resolved.type, {
    baseUrl: resolved.entry?.baseUrl,
    speedModelId: resolved.entry?.speedModelId,
    reasoningModelId: resolved.entry?.reasoningModelId,
  });

  try {
    const { text } = await generateText({
      model: provider.languageModel(modelId),
      system: PERSONA_PLAYBOOK_WRITER_PROMPT,
      prompt: `INTERVIEW TRANSCRIPT:\n\n${transcript}\n\nWrite the complete persona markdown now.`,
    });
    const draft = parsePlaybookDraft(text);
    if (!looksLikePersonaPlaybook(draft.content)) {
      return NextResponse.json(
        {
          error:
            "The model did not return a persona playbook. Try Save persona again, or keep interviewing.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json(draft);
  } catch {
    return NextResponse.json(
      { error: "Failed to draft the persona playbook" },
      { status: 502 },
    );
  }
}
