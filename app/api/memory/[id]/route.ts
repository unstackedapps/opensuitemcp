import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { readDocumentById, writeDocument } from "@/lib/db/documents";
import { getUserSettings } from "@/lib/db/queries";
import { forgetFact, MAX_MEMORY_LENGTH } from "@/lib/documents/memory-actions";
import { resolveNetSuiteAccounts } from "@/lib/netsuite/accounts";

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
  if (!existing || existing.kind !== "memory") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    fact?: unknown;
    netsuiteAccountId?: unknown;
  };
  const fact = typeof body.fact === "string" ? body.fact.trim() : "";
  if (!fact) {
    return NextResponse.json(
      { error: "A memory cannot be empty. Delete it instead." },
      { status: 400 },
    );
  }
  if (fact.length > MAX_MEMORY_LENGTH) {
    return NextResponse.json(
      {
        error: `A memory cannot be longer than ${MAX_MEMORY_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  // Moving a memory to another account changes which chats read it, so the
  // account has to be one this workspace is connected to.
  let netsuiteAccountId = existing.netsuiteAccountId;
  if ("netsuiteAccountId" in body) {
    const next = body.netsuiteAccountId;
    if (next === null) {
      netsuiteAccountId = null;
    } else if (typeof next === "string") {
      const settings = await getUserSettings({ userId: session.user.id });
      const connected = resolveNetSuiteAccounts(settings ?? {}).some(
        (account) => account.accountId === next,
      );
      if (!connected) {
        return NextResponse.json(
          { error: "That NetSuite account is not connected." },
          { status: 400 },
        );
      }
      netsuiteAccountId = next;
    }
  }

  const memory = await writeDocument({
    userId: session.user.id,
    kind: "memory",
    path: existing.path,
    content: fact,
    netsuiteAccountId,
  });

  return NextResponse.json({ memory });
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

  const existing = await readDocumentById({ userId: session.user.id, id });
  if (!existing || existing.kind !== "memory") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const outcome = await forgetFact({
    userId: session.user.id,
    path: existing.path,
  });
  return outcome.ok
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: outcome.error }, { status: 400 });
}
