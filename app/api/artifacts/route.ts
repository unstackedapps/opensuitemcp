import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { listRecentDocuments, writeDocument } from "@/lib/db/documents";
import { normalizeDocumentPath } from "@/lib/documents/paths";

const MAX_TITLE = 200;
const MAX_CONTENT = 1_000_000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artifacts = await listRecentDocuments({
    userId: session.user.id,
    kind: "artifact",
    limit: 200,
  });

  return NextResponse.json({ artifacts });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    path?: unknown;
    title?: unknown;
    content?: unknown;
    chatId?: unknown;
  };

  if (typeof body.content !== "string" || body.content.length === 0) {
    return NextResponse.json(
      { error: "An artifact needs content." },
      { status: 400 },
    );
  }
  if (body.content.length > MAX_CONTENT) {
    return NextResponse.json(
      { error: "That artifact is too large to save." },
      { status: 413 },
    );
  }

  const title =
    typeof body.title === "string" && body.title.trim().length > 0
      ? body.title.trim().slice(0, MAX_TITLE)
      : null;

  const path = normalizeDocumentPath(
    typeof body.path === "string" && body.path.trim().length > 0
      ? body.path
      : // Named after the title so a second save of the same result replaces
        // the first rather than stacking near-identical tiles.
        `${
          (title ?? "artifact")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "artifact"
        }.md`,
  );
  if (!path.ok) {
    return NextResponse.json({ error: path.message }, { status: 400 });
  }

  const artifact = await writeDocument({
    userId: session.user.id,
    kind: "artifact",
    path: path.path,
    title,
    content: body.content,
    chatId: typeof body.chatId === "string" ? body.chatId : null,
  });

  return NextResponse.json({ artifact }, { status: 201 });
}
