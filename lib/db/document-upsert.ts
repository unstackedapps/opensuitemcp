import { sql } from "drizzle-orm";
import { document } from "./schema";

/** The parts of a document write that an existing row can take on. */
export type DocumentWrite = {
  content: string;
  title?: string | null;
  netsuiteAccountId?: string | null;
};

/**
 * What a write changes on a document that is already there.
 *
 * Separate from the insert because the two differ, and the difference is easy
 * to get wrong in the direction of doing nothing: a column left out of this
 * set is accepted, reported as saved, and never written. `netsuiteAccountId`
 * was left out, so moving a memory to a NetSuite account saved its text and
 * silently kept the old account.
 *
 * A key that is present is written, including when it is null. A key that is
 * absent leaves what is there, which is how an artifact write — which names no
 * account — keeps one.
 */
export function documentUpdateSet(params: DocumentWrite, updatedAt: Date) {
  return {
    content: params.content,
    title: sql`coalesce(${params.title ?? null}, ${document.title})`,
    ...("netsuiteAccountId" in params
      ? { netsuiteAccountId: params.netsuiteAccountId ?? null }
      : {}),
    version: sql`${document.version} + 1`,
    updatedAt,
  };
}
