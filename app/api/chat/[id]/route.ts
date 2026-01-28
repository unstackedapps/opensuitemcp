import { auth } from "@/app/(auth)/auth";
import { getChatById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  try {
    const chat = await getChatById({ id });

    if (!chat) {
      return new ChatSDKError("not_found:chat").toResponse();
    }

    // Verify user owns the chat or it's public
    if (chat.visibility === "private" && chat.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    return Response.json(
      {
        maxIterationsReached: chat.maxIterationsReached,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Chat] Error fetching chat:", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
