const SLASH_TOKEN_RE = /(^|\s)\/([A-Za-z0-9_-]+)(?=\s|$)/g;

export type SlashTokenMatch = {
  slug: string;
  start: number;
  end: number;
};

/** Find all `/slug` tokens (word-bounded) in composer text. */
export function findSlashSkillTokens(text: string): SlashTokenMatch[] {
  const matches: SlashTokenMatch[] = [];
  const re = new RegExp(SLASH_TOKEN_RE.source, "g");
  for (const match of text.matchAll(re)) {
    const space = match[1] ?? "";
    const slug = match[2] ?? "";
    const fullIndex = match.index ?? 0;
    const start = fullIndex + space.length;
    matches.push({
      slug,
      start,
      end: start + 1 + slug.length,
    });
  }
  return matches;
}

/** Remove resolved `/slug` tokens from message text sent to the model. */
export function stripResolvedSkillTokens(
  text: string,
  resolvedSlugs: Set<string>,
): string {
  if (resolvedSlugs.size === 0) {
    return text.trim();
  }

  return text
    .replace(new RegExp(SLASH_TOKEN_RE.source, "g"), (match, space, slug) => {
      if (resolvedSlugs.has(String(slug).toLowerCase())) {
        return space.length > 0 ? " " : "";
      }
      return match;
    })
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export type SlashTokenTextSegment =
  | { kind: "text"; value: string; start: number }
  | { kind: "skill"; slug: string; start: number };

/** Split message text into plain text and slash skill tokens for inline badge rendering. */
export function splitTextOnSlashSkillTokens(
  text: string,
  badgeSlugs?: Set<string>,
): SlashTokenTextSegment[] {
  const tokens = findSlashSkillTokens(text);
  if (tokens.length === 0) {
    return [{ kind: "text", value: text, start: 0 }];
  }

  const segments: SlashTokenTextSegment[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const slugKey = token.slug.toLowerCase();
    const shouldBadge =
      !badgeSlugs || badgeSlugs.size === 0 || badgeSlugs.has(slugKey);

    if (token.start > cursor) {
      segments.push({
        kind: "text",
        value: text.slice(cursor, token.start),
        start: cursor,
      });
    }

    if (shouldBadge) {
      segments.push({ kind: "skill", slug: token.slug, start: token.start });
    } else {
      segments.push({
        kind: "text",
        value: text.slice(token.start, token.end),
        start: token.start,
      });
    }
    cursor = token.end;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor), start: cursor });
  }

  return segments.length > 0
    ? segments
    : [{ kind: "text", value: text, start: 0 }];
}
