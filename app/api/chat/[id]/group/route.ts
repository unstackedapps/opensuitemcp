import { auth } from "@/app/(auth)/auth";
import { setChatGroup } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { groupId } = (await request.json()) as { groupId?: unknown };

  if (groupId !== null && typeof groupId !== "string") {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const moved = await setChatGroup({
    chatId: id,
    userId: session.user.id,
    groupId,
  });

  if (!moved) {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  return Response.json({ success: true });
}
