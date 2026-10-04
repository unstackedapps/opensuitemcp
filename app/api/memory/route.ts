import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  deleteAllDocuments,
  listDocuments,
  readDocument,
} from "@/lib/db/documents";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";
import {
  formatNetSuiteAccountDisplay,
  resolveNetSuiteAccounts,
} from "@/lib/netsuite/accounts";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, rows] = await Promise.all([
    getUserSettings({ userId: session.user.id }),
    listDocuments({ userId: session.user.id, kind: "memory" }),
  ]);

  // Bodies too: a memory is a sentence, and a list of paths tells a person
  // nothing about what the model has been told.
  const memories = await Promise.all(
    rows.map(async (row) => {
      const full = await readDocument({
        userId: session.user.id as string,
        kind: "memory",
        path: row.path,
      });
      return {
        id: row.id,
        path: row.path,
        fact: full?.content ?? "",
        netsuiteAccountId: full?.netsuiteAccountId ?? null,
        updatedAt: row.updatedAt,
      };
    }),
  );

  // The accounts come with the memories so a row can name the account it was
  // learned in rather than printing its id, and so the filter has something to
  // list. A memory may name an account that has since been removed, which is
  // exactly the row someone reviewing for compliance needs to see.
  const accounts = resolveNetSuiteAccounts(settings ?? {}).map((account) => ({
    accountId: account.accountId,
    label: formatNetSuiteAccountDisplay(account),
  }));

  return NextResponse.json({
    memories,
    accounts,
    activeAccountId: settings?.netsuiteAccountId ?? null,
    memoryEnabled: settings?.memoryEnabled !== false,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { memoryEnabled?: unknown };
  if (typeof body.memoryEnabled !== "boolean") {
    return NextResponse.json(
      { error: "Pass memoryEnabled as true or false." },
      { status: 400 },
    );
  }

  await upsertUserSettings({
    userId: session.user.id,
    memoryEnabled: body.memoryEnabled,
  });

  return NextResponse.json({ memoryEnabled: body.memoryEnabled });
}

/** Forget everything. The switch stops memory being used; this empties it. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forgotten = await deleteAllDocuments({
    userId: session.user.id,
    kind: "memory",
  });

  return NextResponse.json({ forgotten });
}
