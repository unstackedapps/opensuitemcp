import { auth } from "@/app/(auth)/auth";
import { getChatById, updateChatMaxIterationsReached } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function POST(
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

    // Only the chat owner may clear the flag (matches vote and chat POST behavior)
    if (chat.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    // Clear the maxIterationsReached flag
    await updateChatMaxIterationsReached({
      chatId: id,
      maxIterationsReached: false,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[MaxIterations] Error clearing flag:", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
