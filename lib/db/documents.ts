import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { documentUpdateSet } from "@/lib/db/document-upsert";
import { type Document, type DocumentKind, document } from "@/lib/db/schema";

/** Enough to list a directory without carrying every body with it. */
export type DocumentSummary = {
  id: string;
  path: string;
  title: string | null;
  bytes: number;
  version: number;
  updatedAt: Date;
};

type Scope = {
  userId: string;
  kind: DocumentKind;
  /**
   * Which account's memories to read.
   *
   * Omitted means every one, which is what an artifact listing wants. Passed
   * means this account's documents and the ones belonging to no account — a
   * fact learned in sandbox is never read back against production, and a fact
   * about the workspace itself is read everywhere.
   */
  netsuiteAccountId?: string | null;
};

function scopeWhere(scope: Scope) {
  const clauses = [
    eq(document.userId, scope.userId),
    eq(document.kind, scope.kind),
  ];
  if (scope.netsuiteAccountId !== undefined) {
    clauses.push(
      scope.netsuiteAccountId === null
        ? isNull(document.netsuiteAccountId)
        : sql`(${document.netsuiteAccountId} = ${scope.netsuiteAccountId} or ${document.netsuiteAccountId} is null)`,
    );
  }
  return and(...clauses);
}

export async function listDocuments(
  scope: Scope & { limit?: number },
): Promise<DocumentSummary[]> {
  const rows = await db
    .select({
      id: document.id,
      path: document.path,
      title: document.title,
      bytes: sql<number>`octet_length(${document.content})`,
      version: document.version,
      updatedAt: document.updatedAt,
    })
    .from(document)
    .where(scopeWhere(scope))
    .orderBy(document.path)
    .limit(scope.limit ?? 500);
  return rows.map((row) => ({ ...row, bytes: Number(row.bytes) }));
}

export async function readDocument(
  scope: Scope & { path: string },
): Promise<Document | null> {
  const [row] = await db
    .select()
    .from(document)
    .where(and(scopeWhere(scope), eq(document.path, scope.path)))
    .limit(1);
  return row ?? null;
}

export async function readDocumentById(params: {
  userId: string;
  id: string;
}): Promise<Document | null> {
  const [row] = await db
    .select()
    .from(document)
    .where(and(eq(document.userId, params.userId), eq(document.id, params.id)))
    .limit(1);
  return row ?? null;
}

/**
 * Write a document, replacing what is at that path.
 *
 * One statement rather than a read and a write, so two agents writing the same
 * path cannot both believe they created it. `version` counts the writes.
 */
export async function writeDocument(params: {
  userId: string;
  kind: DocumentKind;
  path: string;
  content: string;
  title?: string | null;
  chatId?: string | null;
  netsuiteAccountId?: string | null;
}): Promise<Document> {
  const [row] = await db
    .insert(document)
    .values({
      userId: params.userId,
      kind: params.kind,
      path: params.path,
      content: params.content,
      title: params.title ?? null,
      chatId: params.chatId ?? null,
      netsuiteAccountId: params.netsuiteAccountId ?? null,
    })
    .onConflictDoUpdate({
      target: [document.userId, document.kind, document.path],
      set: documentUpdateSet(params, new Date()),
    })
    .returning();
  return row;
}

/**
 * Retitle a document without touching its content.
 *
 * Not the upsert: `version` counts content writes, and renaming something
 * should not make it look edited three times.
 */
export async function setDocumentTitle(params: {
  userId: string;
  id: string;
  title: string | null;
}): Promise<Document | null> {
  const [row] = await db
    .update(document)
    .set({ title: params.title, updatedAt: new Date() })
    .where(and(eq(document.userId, params.userId), eq(document.id, params.id)))
    .returning();
  return row ?? null;
}

/** True when a document was there to delete. */
export async function deleteDocument(
  scope: Scope & { path: string },
): Promise<boolean> {
  const rows = await db
    .delete(document)
    .where(and(scopeWhere(scope), eq(document.path, scope.path)))
    .returning({ id: document.id });
  return rows.length > 0;
}

/** Everything of one kind, gone. Returns how many there were. */
export async function deleteAllDocuments(params: {
  userId: string;
  kind: DocumentKind;
}): Promise<number> {
  const rows = await db
    .delete(document)
    .where(
      and(eq(document.userId, params.userId), eq(document.kind, params.kind)),
    )
    .returning({ id: document.id });
  return rows.length;
}

/**
 * Move a document to another path.
 *
 * Returns null when nothing was there, and throws on a unique violation rather
 * than overwriting: a rename that silently replaces a document loses one.
 */
export async function renameDocument(
  scope: Scope & { fromPath: string; toPath: string },
): Promise<Document | null> {
  const [row] = await db
    .update(document)
    .set({ path: scope.toPath, updatedAt: new Date() })
    .where(and(scopeWhere(scope), eq(document.path, scope.fromPath)))
    .returning();
  return row ?? null;
}

/** Most recently written first, for a panel that opens on what is current. */
export async function listRecentDocuments(
  scope: Scope & { limit?: number },
): Promise<DocumentSummary[]> {
  const rows = await db
    .select({
      id: document.id,
      path: document.path,
      title: document.title,
      bytes: sql<number>`octet_length(${document.content})`,
      version: document.version,
      updatedAt: document.updatedAt,
    })
    .from(document)
    .where(scopeWhere(scope))
    .orderBy(desc(document.updatedAt))
    .limit(scope.limit ?? 20);
  return rows.map((row) => ({ ...row, bytes: Number(row.bytes) }));
}
