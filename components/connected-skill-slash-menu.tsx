"use client";

import { useMemo } from "react";
import { findSlashSkillTokens } from "@/lib/ai/skills/slash-tokens";
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

/** True when Enter should pick from the slash menu instead of submitting. */
export function shouldPickSlashSkillOnSubmit(
  query: string,
  filtered: SlashConnectedSkill[],
): boolean {
  if (filtered.length === 0) {
    return false;
  }
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }
  if (filtered.length > 1) {
    return true;
  }
  return filtered[0].slug.toLowerCase() !== normalizedQuery;
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
