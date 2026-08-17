"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type SlashConnectedSkill = {
  id: string;
  name: string;
  description: string;
  slug: string;
  connectionLabel: string;
};

type ConnectedSkillSlashMenuProps = {
  skills: SlashConnectedSkill[];
  query: string;
  activeIndex: number;
  onSelect: (skill: SlashConnectedSkill) => void;
  onHoverIndex: (index: number) => void;
};

const SLASH_TOKEN_RE = /(^|\s)\/([A-Za-z0-9_-]+)(?=\s|$)/g;
const TRAILING_SLASH_RE = /(?:^|\s)\/([A-Za-z0-9_-]*)$/;

function skillHasSlugCollision(
  skills: SlashConnectedSkill[],
  slug: string,
): boolean {
  return skills.filter((skill) => skill.slug === slug).length > 1;
}

export function filterSlashSkills(
  skills: SlashConnectedSkill[],
  query: string,
): SlashConnectedSkill[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return skills;
  }
  return skills.filter(
    (skill) =>
      skill.slug.toLowerCase().includes(q) ||
      skill.name.toLowerCase().includes(q) ||
      skill.connectionLabel.toLowerCase().includes(q),
  );
}

/** Match trailing `/slug` fragment at start or after whitespace. */
export function parseTrailingSlashQuery(
  input: string,
): { start: number; query: string } | null {
  const match = input.match(TRAILING_SLASH_RE);
  if (!match) {
    return null;
  }
  const query = match[1] ?? "";
  const start = input.length - query.length - 1;
  return { start, query };
}

/** Complete the trailing slash query with a selected skill token. */
export function insertSlashSkillToken(
  input: string,
  slashStart: number,
  skill: SlashConnectedSkill,
): string {
  const before = input.slice(0, slashStart).replace(/\s+$/, "");
  const after = input
    .slice(slashStart)
    .replace(/^\/[A-Za-z0-9_-]*/, "")
    .replace(/^\s*/, "");
  const head = before.length > 0 ? `${before} ` : "";
  return after.length > 0
    ? `${head}/${skill.slug} ${after}`
    : `${head}/${skill.slug} `;
}

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

export type ResolveSlashSkillsResult =
  | {
      ok: true;
      skills: SlashConnectedSkill[];
      resolvedSlugs: Set<string>;
    }
  | {
      ok: false;
      reason: "ambiguous";
      slug: string;
    };

/**
 * Resolve `/slug` tokens in text to connected skills.
 * `preferredIdsBySlug` disambiguates when the same slug exists in multiple packs
 * (from an earlier menu pick).
 */
export function resolveSlashSkillsInText(
  text: string,
  skills: SlashConnectedSkill[],
  preferredIdsBySlug: Record<string, string> = {},
): ResolveSlashSkillsResult {
  const tokens = findSlashSkillTokens(text);
  const resolved: SlashConnectedSkill[] = [];
  const seenIds = new Set<string>();
  const resolvedSlugs = new Set<string>();

  for (const token of tokens) {
    const slugKey = token.slug.toLowerCase();
    const matches = skills.filter(
      (skill) => skill.slug.toLowerCase() === slugKey,
    );
    if (matches.length === 0) {
      continue;
    }

    let pick: SlashConnectedSkill | undefined;
    if (matches.length === 1) {
      pick = matches[0];
    } else {
      const preferredId = preferredIdsBySlug[slugKey];
      pick = matches.find((skill) => skill.id === preferredId);
      if (!pick) {
        return { ok: false, reason: "ambiguous", slug: token.slug };
      }
    }

    resolvedSlugs.add(slugKey);
    if (!seenIds.has(pick.id)) {
      seenIds.add(pick.id);
      resolved.push(pick);
    }
  }

  return { ok: true, skills: resolved, resolvedSlugs };
}

/** Remove resolved `/slug` tokens from the message text sent to the model. */
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

export function ConnectedSkillSlashMenu({
  skills,
  query,
  activeIndex,
  onSelect,
  onHoverIndex,
}: ConnectedSkillSlashMenuProps) {
  const filtered = useMemo(
    () => filterSlashSkills(skills, query),
    [skills, query],
  );

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md rounded-xl border border-border bg-background p-3 shadow-lg">
        <p className="text-muted-foreground text-xs">
          No connected skills match{" "}
          <code className="rounded bg-muted px-1">/{query || "…"}</code>.
          Connect a pack in Skills → Connected.
        </p>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-full max-w-md overflow-y-auto rounded-xl border border-border bg-background py-1 shadow-lg"
      role="listbox"
    >
      {filtered.map((skill, index) => {
        const showLabel = skillHasSlugCollision(skills, skill.slug);
        return (
          <button
            aria-selected={index === activeIndex}
            className={cn(
              "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors",
              index === activeIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted/60",
            )}
            key={skill.id}
            onClick={() => onSelect(skill)}
            onMouseEnter={() => onHoverIndex(index)}
            role="option"
            type="button"
          >
            <span className="font-medium">
              /{skill.slug}
              {showLabel ? (
                <span className="ml-1.5 font-normal text-muted-foreground text-xs">
                  ({skill.connectionLabel})
                </span>
              ) : null}
            </span>
            <span className="line-clamp-1 text-muted-foreground text-xs">
              {skill.name}
              {skill.description ? ` — ${skill.description}` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
