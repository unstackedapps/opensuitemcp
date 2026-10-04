/**
 * What a document's `path` is allowed to be.
 *
 * A path is a key in a table, not a location on disk, so `../` reaches nothing.
 * It is still rejected: the model writing these also writes real files, the
 * paths are shown to people and echoed back into prompts, and a store that
 * accepts `../../etc/passwd` as a key invites the first person who exports it
 * to a directory to reproduce it faithfully. Anthropic's own memory tool
 * documents this as the mistake to avoid.
 *
 * Percent-encoding is decoded before the check, because `%2e%2e%2f` is `../`
 * to anything that later resolves it.
 */

export const MAX_DOCUMENT_PATH_LENGTH = 256;

export type DocumentPathError =
  | "empty"
  | "too-long"
  | "traversal"
  | "backslash"
  | "control-character";

export type DocumentPathResult =
  | { ok: true; path: string }
  | { ok: false; reason: DocumentPathError; message: string };

const MESSAGES: Record<DocumentPathError, string> = {
  backslash: "Use `/` between path segments, not `\\`.",
  "control-character": "A path cannot contain control characters.",
  empty: "Pass a path, such as `vendors/acme.md`.",
  traversal: "A path cannot contain `.` or `..` segments.",
  "too-long": `A path cannot be longer than ${MAX_DOCUMENT_PATH_LENGTH} characters.`,
};

function fail(reason: DocumentPathError): DocumentPathResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/**
 * The stored form of a path, or why it was refused.
 *
 * A leading slash is stripped rather than refused: an agent that learned
 * `/memories/notes.md` elsewhere means `memories/notes.md` here, and correcting
 * it costs a round trip to say so.
 *
 * Case is kept. `Notes.md` and `notes.md` are two documents, as they are on any
 * case-sensitive filesystem.
 */
export function normalizeDocumentPath(raw: string): DocumentPathResult {
  let candidate = raw.trim();
  if (!candidate) {
    return fail("empty");
  }

  // Decoded before anything is judged, so an encoded `../` is seen as one. A
  // malformed escape is left as written rather than throwing.
  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // `%` on its own is a legal character in a name.
  }

  if (candidate.includes("\\")) {
    return fail("backslash");
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the check.
  if (/[\u0000-\u001f\u007f]/.test(candidate)) {
    return fail("control-character");
  }

  const segments = candidate
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return fail("empty");
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return fail("traversal");
  }

  const path = segments.join("/");
  if (path.length > MAX_DOCUMENT_PATH_LENGTH) {
    return fail("too-long");
  }
  return { ok: true, path };
}
