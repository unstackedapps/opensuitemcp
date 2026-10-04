/**
 * How memories reach a turn.
 *
 * A memory is a fact the model recalls without being asked: "figures in
 * thousands", "subsidiary 7 is dormant". Short, standalone, re-read every
 * session. It is not a procedure — that is a skill — and not a document a
 * person reads — that is an artifact.
 *
 * Read in full while they fit, because a dozen sentences cost less than the
 * tool call that would fetch them. Past the budget only the paths go in and the
 * model reads what it needs, which is the just-in-time pattern Anthropic's
 * memory tool documents.
 */

export type MemoryEntry = {
  path: string;
  content: string;
  /** Null means it was written with no account connected. */
  netsuiteAccountId: string | null;
  updatedAt: Date;
};

/** Beyond this the listing goes in instead, and the model reads on demand. */
export const MEMORY_PROMPT_BUDGET = 6000;

/** A memory older than this is worth a second look before it is acted on. */
export const MEMORY_STALE_DAYS = 180;

export function isMemoryStale(updatedAt: Date, now: Date): boolean {
  const days = (now.getTime() - updatedAt.getTime()) / 86_400_000;
  return days >= MEMORY_STALE_DAYS;
}

function line(entry: MemoryEntry, now: Date): string {
  const learned = entry.updatedAt.toISOString().slice(0, 10);
  const stale = isMemoryStale(entry.updatedAt, now)
    ? ", old enough to confirm before acting on"
    : "";
  return `- ${entry.path} (learned ${learned}${stale}): ${entry.content.trim()}`;
}

/**
 * The memory section of a system prompt, or nothing.
 *
 * Staleness is named on every entry rather than hidden, because the common way
 * this goes wrong is an agent treating a fact from March as current. NetSuite
 * configuration moves; a saved search gets renamed and the memory does not.
 */
export function renderMemoryPrompt(
  entries: readonly MemoryEntry[],
  now: Date,
): string {
  if (entries.length === 0) {
    return "";
  }

  const sorted = [...entries].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const full = sorted.map((entry) => line(entry, now)).join("\n");

  const header =
    "What you have been asked to remember about this person and this NetSuite account. Treat each as something they told you, not as something you verified; a line marked old is worth confirming before you act on it.";

  if (full.length <= MEMORY_PROMPT_BUDGET) {
    return `${header}\n\n${full}`;
  }

  const paths = sorted.map((entry) => `- ${entry.path}`).join("\n");
  return `${header}\n\nThere are too many to read here. These are the paths; read one with the recall tool when it bears on the task.\n\n${paths}`;
}

/**
 * Which memories a turn may see.
 *
 * A memory carries the account it was learned in. Reading against another
 * account must not surface it: a customization that exists in sandbox and not
 * in production is the mistake this prevents. A memory written with no account
 * connected carries none, and is read everywhere until it is moved to one.
 */
export function selectMemoriesForAccount(
  entries: readonly MemoryEntry[],
  accountId: string | null,
): MemoryEntry[] {
  return entries.filter(
    (entry) =>
      entry.netsuiteAccountId === null ||
      (accountId !== null && entry.netsuiteAccountId === accountId),
  );
}
