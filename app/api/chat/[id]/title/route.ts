import { auth } from "@/app/(auth)/auth";
import { renameChat } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const MAX_TITLE = 255;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { title } = (await request.json()) as { title?: unknown };

  if (typeof title !== "string" || title.trim().length === 0) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  await renameChat({
    chatId: id,
    userId: session.user.id,
    title: title.trim().slice(0, MAX_TITLE),
  });

  return Response.json({ success: true });
}
