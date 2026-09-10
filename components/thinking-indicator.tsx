"use client";

import {
  resolveSkillMode,
  type SkillInvocationMode,
  type SkillKind,
} from "@/lib/ai/skills/modes";
import {
  collectInvokedSkillsFromMessage,
  type SkillChip,
} from "@/lib/ai/skills/turn-chips";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export type { SkillChip } from "@/lib/ai/skills/turn-chips";

type SkillsPayload = {
  catalog?: Array<{
    id: string;
    name: string;
    alwaysOn?: boolean;
    source?: string;
  }>;
  customSkills?: Array<{ id: string; name: string; enabled?: boolean }>;
  connectedSkills?: Array<{
    id: string;
    name: string;
    sourceId?: string;
  }>;
  enabledSkillIds?: string[];
  skillModes?: Record<string, SkillInvocationMode>;
  disabledOrgConnectedSkillSourceIds?: string[];
};

const MAX_VISIBLE_CHIPS = 4;

function kindFromSource(source: string | undefined): SkillKind {
  if (source === "community" || source === "custom" || source === "connected") {
    return source;
  }
  return "oracle";
}

export function collectSkillsForUserMessage(
  userMessage: ChatMessage | undefined,
  skills: SkillsPayload | undefined,
): SkillChip[] {
  const chips = new Map<string, SkillChip>();
  for (const skill of collectInvokedSkillsFromMessage(userMessage)) {
    chips.set(skill.id, skill);
  }

  if (!skills) {
    return [...chips.values()];
  }

  const skillModes = skills.skillModes ?? {};
  const enabledSkillIds = skills.enabledSkillIds ?? [];
  const disabledPacks = new Set(
    skills.disabledOrgConnectedSkillSourceIds ?? [],
  );

  for (const skill of skills.catalog ?? []) {
    if (skill.alwaysOn) {
      continue;
    }
    const mode = resolveSkillMode({
      skillId: skill.id,
      kind: kindFromSource(skill.source),
      alwaysOn: skill.alwaysOn,
      skillModes,
      enabledSkillIds,
    });
    if (mode === "auto") {
      chips.set(skill.id, { id: skill.id, name: skill.name });
    }
  }

  for (const skill of skills.customSkills ?? []) {
    const mode = resolveSkillMode({
      skillId: skill.id,
      kind: "custom",
      skillModes,
      enabledSkillIds,
      customEnabled: skill.enabled !== false,
    });
    if (mode === "auto") {
      chips.set(skill.id, {
        id: skill.id,
        name: skill.name.trim() || "Custom skill",
      });
    }
  }

  for (const skill of skills.connectedSkills ?? []) {
    if (skill.sourceId && disabledPacks.has(skill.sourceId)) {
      continue;
    }
    const mode = resolveSkillMode({
      skillId: skill.id,
      kind: "connected",
      skillModes,
      enabledSkillIds,
    });
    if (mode === "auto") {
      chips.set(skill.id, { id: skill.id, name: skill.name });
    }
  }

  return [...chips.values()];
}

export function collectTurnSkillChips(
  messages: ChatMessage[],
  skills: SkillsPayload | undefined,
): SkillChip[] {
  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  return collectSkillsForUserMessage(lastUser, skills);
}

const DOTS = [
  { color: "bg-blue-500", delay: "0ms" },
  { color: "bg-orange-600", delay: "200ms" },
  { color: "bg-black dark:bg-white", delay: "400ms" },
] as const;

function ThinkingDots() {
  return (
    <span aria-hidden className="flex h-6 shrink-0 items-center gap-1.5">
      {DOTS.map((dot) => (
        <span
          className={cn(
            "size-2.5 animate-smooth-bounce rounded-full motion-reduce:animate-none",
            dot.color,
          )}
          key={dot.color}
          style={{ animationDelay: dot.delay }}
        />
      ))}
    </span>
  );
}

export function ThinkingIndicator({
  className,
  skills = [],
}: {
  className?: string;
  skills?: SkillChip[];
}) {
  const visible = skills.slice(0, MAX_VISIBLE_CHIPS);
  const extra = skills.length - visible.length;

  return (
    <div
      aria-live="polite"
      className={cn(
        "flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-2 md:px-0",
        className,
      )}
      data-testid="message-assistant-loading"
    >
      <div className="flex h-6 min-w-0 items-center gap-1.5 text-muted-foreground">
        <ThinkingDots />
        <span className="animate-thinking-shimmer text-sm motion-reduce:animate-none">
          Thinking...
        </span>
      </div>
      {visible.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {visible.map((skill) => (
            <span
              className="inline-flex h-6 max-w-32 min-w-0 items-center truncate rounded-full border bg-muted/60 px-2 text-[10px] text-muted-foreground"
              key={skill.id}
              title={skill.name}
            >
              {skill.name}
            </span>
          ))}
          {extra > 0 ? (
            <span className="text-[10px] text-muted-foreground">+{extra}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
