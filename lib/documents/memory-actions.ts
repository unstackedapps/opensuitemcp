import "server-only";

import {
  deleteDocument,
  listDocuments,
  readDocument,
  writeDocument,
} from "@/lib/db/documents";
import type { MemoryEntry } from "@/lib/documents/memory";
import { normalizeDocumentPath } from "@/lib/documents/paths";

/**
 * Remember, recall and forget — once, for both callers.
 *
 * The chat model reaches these through `lib/ai/tools`, a connected agent
 * through the MCP surface. One implementation so a memory written from Cursor
 * reads the same as one written in the app, and so the account stamp cannot be
 * applied in one place and forgotten in the other.
 */

/** Long enough for a fact with its qualifier, short enough to stay a fact. */
export const MAX_MEMORY_LENGTH = 2000;

/** Past this the set stops being readable and starts being a log. */
export const MAX_MEMORIES = 200;

export type MemoryOutcome =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function rememberFact(params: {
  userId: string;
  path: string;
  content: string;
  /** Null stores it against the workspace, read under every account. */
  netsuiteAccountId: string | null;
}): Promise<MemoryOutcome> {
  const path = normalizeDocumentPath(params.path);
  if (!path.ok) {
    return { ok: false, error: path.message };
  }

  const content = params.content.trim();
  if (!content) {
    return { ok: false, error: "Pass the fact to remember." };
  }
  if (content.length > MAX_MEMORY_LENGTH) {
    return {
      ok: false,
      error: `A memory cannot be longer than ${MAX_MEMORY_LENGTH} characters. A memory is a fact; a procedure belongs in a skill and a document in an artifact.`,
    };
  }

  const existing = await readDocument({
    userId: params.userId,
    kind: "memory",
    path: path.path,
  });

  if (!existing) {
    const all = await listDocuments({ userId: params.userId, kind: "memory" });
    if (all.length >= MAX_MEMORIES) {
      return {
        ok: false,
        error: `This workspace already holds ${MAX_MEMORIES} memories. Revise one or forget one before adding another.`,
      };
    }
  }

  const saved = await writeDocument({
    userId: params.userId,
    kind: "memory",
    path: path.path,
    content,
    netsuiteAccountId: params.netsuiteAccountId,
  });

  return {
    ok: true,
    message: existing
      ? `Replaced the memory at \`${saved.path}\`.`
      : `Remembered, at \`${saved.path}\`.`,
  };
}

export async function recallMemories(params: {
  userId: string;
  netsuiteAccountId: string | null;
}): Promise<MemoryEntry[]> {
  const rows = await listDocuments({
    userId: params.userId,
    kind: "memory",
    netsuiteAccountId: params.netsuiteAccountId,
  });
  const bodies = await Promise.all(
    rows.map((row) =>
      readDocument({
        userId: params.userId,
        kind: "memory",
        path: row.path,
      }),
    ),
  );
  return bodies
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .map((row) => ({
      path: row.path,
      content: row.content,
      netsuiteAccountId: row.netsuiteAccountId,
      updatedAt: row.updatedAt,
    }));
}

export async function recallOne(params: {
  userId: string;
  path: string;
}): Promise<MemoryEntry | null> {
  const path = normalizeDocumentPath(params.path);
  if (!path.ok) {
    return null;
  }
  const row = await readDocument({
    userId: params.userId,
    kind: "memory",
    path: path.path,
  });
  return row
    ? {
        path: row.path,
        content: row.content,
        netsuiteAccountId: row.netsuiteAccountId,
        updatedAt: row.updatedAt,
      }
    : null;
}

export async function forgetFact(params: {
  userId: string;
  path: string;
}): Promise<MemoryOutcome> {
  const path = normalizeDocumentPath(params.path);
  if (!path.ok) {
    return { ok: false, error: path.message };
  }
  const deleted = await deleteDocument({
    userId: params.userId,
    kind: "memory",
    path: path.path,
  });
  return deleted
    ? { ok: true, message: `Forgot \`${path.path}\`.` }
    : {
        ok: false,
        error: `There is no memory at \`${path.path}\`. Recall the list for the paths that exist.`,
      };
}
