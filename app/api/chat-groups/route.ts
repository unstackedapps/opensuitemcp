import { auth } from "@/app/(auth)/auth";
import { createChatGroup, getChatGroupsByUserId } from "@/lib/db/queries";
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
