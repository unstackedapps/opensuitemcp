import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  findProviderById,
  isMultiAiProviders,
  parseAiProviderConfig,
} from "@/lib/ai/provider-entries";
import {
  getChatById,
  getUserSettings,
  updateChatAiProviderId,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const bodySchema = z.object({
  aiProviderId: z.string().max(64).nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  try {
    const body = bodySchema.parse(await request.json());
    const chat = await getChatById({ id });

    if (!chat) {
      return new ChatSDKError("not_found:chat").toResponse();
    }
    if (chat.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    const settings = await getUserSettings({ userId: session.user.id });
    const config = parseAiProviderConfig(settings?.aiProviders);
    if (!isMultiAiProviders(config)) {
      return Response.json(
        { error: "Multiple AI providers are not enabled." },
        { status: 400 },
      );
    }

    if (body.aiProviderId && !findProviderById(config, body.aiProviderId)) {
      return Response.json({ error: "Unknown AI provider." }, { status: 400 });
    }

    await updateChatAiProviderId({
      chatId: id,
      aiProviderId: body.aiProviderId,
    });

    return Response.json({ success: true, aiProviderId: body.aiProviderId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("[Chat] Error updating AI provider:", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
