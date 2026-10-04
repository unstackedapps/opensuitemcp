import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  deleteDocument,
  readDocument,
  readDocumentById,
  renameDocument,
  setDocumentTitle,
} from "@/lib/db/documents";
import { normalizeDocumentPath } from "@/lib/documents/paths";

const MAX_TITLE = 200;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artifact = await readDocumentById({ userId: session.user.id, id });
  if (!artifact || artifact.kind !== "artifact") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ artifact });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read first, so another kind of document cannot be deleted through this
  // route by id alone.
  const artifact = await readDocumentById({ userId: session.user.id, id });
  if (!artifact || artifact.kind !== "artifact") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteDocument({
    userId: session.user.id,
    kind: "artifact",
    path: artifact.path,
  });

  return NextResponse.json({ deleted: true });
}

/**
 * Rename an artifact: its title, its path, or both.
 *
 * The path is what makes a document addressable, so moving one is a real move
 * rather than a second copy. A path already in use is refused instead of
 * overwritten — a rename that quietly replaces something loses it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await readDocumentById({ userId: session.user.id, id });
  if (!existing || existing.kind !== "artifact") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { title?: unknown; path?: unknown };

  const title =
    typeof body.title === "string"
      ? body.title.trim().slice(0, MAX_TITLE) || null
      : undefined;

  let path: string | undefined;
  if (typeof body.path === "string" && body.path.trim().length > 0) {
    const normalized = normalizeDocumentPath(body.path);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.message }, { status: 400 });
    }
    path = normalized.path;
  }

  if (title === undefined && path === undefined) {
    return NextResponse.json(
      { error: "Pass a title, a path, or both." },
      { status: 400 },
    );
  }

  if (path !== undefined && path !== existing.path) {
    const occupied = await readDocument({
      userId: session.user.id,
      kind: "artifact",
      path,
    });
    if (occupied) {
      return NextResponse.json(
        { error: `There is already an artifact at ${path}.` },
        { status: 409 },
      );
    }
    const moved = await renameDocument({
      userId: session.user.id,
      kind: "artifact",
      fromPath: existing.path,
      toPath: path,
    }).catch(() => null);
    if (!moved) {
      return NextResponse.json(
        { error: `There is already an artifact at ${path}.` },
        { status: 409 },
      );
    }
  }

  if (title !== undefined) {
    await setDocumentTitle({ userId: session.user.id, id, title });
  }

  const artifact = await readDocumentById({ userId: session.user.id, id });
  return NextResponse.json({ artifact });
}
