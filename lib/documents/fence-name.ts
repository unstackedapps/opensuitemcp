/**
 * A name and a path for a code block someone saved from a chat.
 *
 * Saving writes to a path, and a write to an existing path replaces it, so the
 * path has to come from the content. `javascript · 48 lines` named two
 * unrelated scripts the same thing and the second quietly ate the first.
 *
 * The title is read out of the code where the code says what it is, because a
 * person scanning tiles reads titles, not languages.
 */

const MAX_TITLE = 72;

/** 32-bit FNV-1a. Short, stable, and not a security claim. */
function fingerprint(value: string): string {
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash.toString(36).padStart(7, "0").slice(0, 7);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function tidy(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > MAX_TITLE
    ? `${trimmed.slice(0, MAX_TITLE - 1).trimEnd()}…`
    : trimmed;
}

/**
 * What the code calls itself.
 *
 * `@description` first, because a SuiteScript header carries one and it is the
 * sentence its author wrote for exactly this purpose. Then a leading comment,
 * then a markdown or SQL heading. Nothing found means the language is all
 * anyone can be told.
 */
export function readFenceTitle(code: string, language: string): string {
  const description = code.match(/@description\s+(.+)/);
  if (description?.[1]) {
    return tidy(description[1]);
  }

  for (const line of code.split("\n").slice(0, 12)) {
    const comment = line.match(
      /^\s*(?:\/\/|#|--|\*|\/\*)\s*(.+?)\s*(?:\*\/)?$/,
    );
    const text = comment?.[1]?.trim();
    // A bare `*` border or a tag line names nothing.
    if (
      text &&
      text.length > 3 &&
      !text.startsWith("@") &&
      !/^[*=\-_/]+$/.test(text)
    ) {
      return tidy(text);
    }
    const heading = line.match(/^\s*#{1,6}\s+(.+)/);
    if (heading?.[1]) {
      return tidy(heading[1]);
    }
  }

  return language === "text" ? "Snippet" : `${language} snippet`;
}

/**
 * Where it is saved.
 *
 * The fingerprint is the point: two different scripts never collide, and the
 * same script saved twice lands on the same path and replaces itself rather
 * than stacking a second identical tile.
 */
export function describeFence(
  code: string,
  language: string,
): { title: string; path: string } {
  const title = readFenceTitle(code, language);
  const stem = slugify(title) || slugify(language) || "snippet";
  return { title, path: `chat/${stem}-${fingerprint(code)}.md` };
}
