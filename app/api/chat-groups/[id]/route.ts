import { auth } from "@/app/(auth)/auth";
import { deleteChatGroup, updateChatGroup } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const MAX_NAME = 80;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body = (await request.json()) as {
    name?: unknown;
    collapsed?: unknown;
  };

  const name =
    typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim().slice(0, MAX_NAME)
      : undefined;
  const collapsed =
    typeof body.collapsed === "boolean" ? body.collapsed : undefined;

  if (name === undefined && collapsed === undefined) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  await updateChatGroup({ id, userId: session.user.id, name, collapsed });

  return Response.json({ success: true });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  await deleteChatGroup({ id, userId: session.user.id });

  return Response.json({ success: true });
}
