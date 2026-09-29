import { auth } from "@/app/(auth)/auth";
import { markChatViewed } from "@/lib/db/queries";
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
    // Scoped to the owner in the where clause, so a reader of a public chat
    // updates nothing rather than being rejected.
    await markChatViewed({ chatId: id, userId: session.user.id });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Viewed] Error marking chat viewed:", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
