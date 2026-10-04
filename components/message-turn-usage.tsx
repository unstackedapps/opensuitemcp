"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatTurnUsageLabel } from "@/lib/chat/message-turn-meta";
import type { TurnMemory } from "@/lib/chat/turn-memories";
import { cn } from "@/lib/utils";
import type { SkillChip } from "./thinking-indicator";

export function MessageTurnUsage({
  skills,
  toolCount,
  succeededToolCount,
  failedToolCount,
  emptyToolCount,
  memories = [],
  children,
}: {
  skills: SkillChip[];
  toolCount: number;
  succeededToolCount: number;
  failedToolCount: number;
  emptyToolCount: number;
  /** Read into the turn before the model ran, so nothing else shows them. */
  memories?: TurnMemory[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const label = formatTurnUsageLabel(
    skills.length,
    toolCount,
    failedToolCount,
    succeededToolCount,
    emptyToolCount,
    memories.length,
  );

  if (!label) {
    return null;
  }

  return (
    <Collapsible className="w-full min-w-0" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger
        className="inline-flex max-w-full cursor-pointer items-center gap-0.5 rounded-md py-0.5 text-left text-[11px] text-muted-foreground hover:text-foreground md:text-xs"
        data-testid="message-turn-usage"
        type="button"
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 pt-2">
        {skills.length > 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {skills.map((skill) => (
              <span
                className="inline-flex h-6 max-w-48 min-w-0 items-center truncate rounded-full border bg-muted/60 px-2 text-[10px] text-muted-foreground"
                key={skill.id}
                title={skill.name}
              >
                {skill.name}
              </span>
            ))}
          </div>
        ) : null}
        {memories.length > 0 ? (
          <ul className="flex min-w-0 flex-col gap-0.5">
            {memories.map((memory) => (
              <li
                className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground"
                key={memory.path}
              >
                <span className="truncate">{memory.path}</span>
                <span className="shrink-0 opacity-70">
                  {memory.accountId ?? "No account"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {toolCount > 0 ? (
          <div className="flex flex-col gap-2 *:mb-0">{children}</div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
