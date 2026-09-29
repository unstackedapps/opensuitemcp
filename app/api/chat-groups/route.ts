import { auth } from "@/app/(auth)/auth";
import {
  createChatGroup,
  getChatGroupsByUserId,
  reorderChatGroups,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const MAX_NAME = 80;

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const groups = await getChatGroupsByUserId({ userId: session.user.id });

  return Response.json({ groups });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { name } = (await request.json()) as { name?: unknown };

  if (typeof name !== "string" || name.trim().length === 0) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const trimmed = name.trim().slice(0, MAX_NAME);
  const created = await createChatGroup({
    userId: session.user.id,
    name: trimmed,
  });

  if (!created) {
    return Response.json(
      { error: `A group called “${trimmed}” already exists.` },
      { status: 409 },
    );
  }

  return Response.json({ group: created }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { ids } = (await request.json()) as { ids?: unknown };

  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  await reorderChatGroups({ userId: session.user.id, ids: ids as string[] });

  return Response.json({ success: true });
}
