"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One way to present a list of things, for every panel in the app.
 *
 * Six had grown: bordered cards at two paddings, divided rows inside a box and
 * without one, border-bottom rows, and a tile grid — with radius, border color
 * and padding disagreeing across them. The Skills panel showed two of them at
 * once, so a custom skill and an Oracle skill looked like different kinds of
 * thing.
 *
 * `divided` is the default because a panel already has a border of its own, and
 * a card inside it draws a second one around every row. `spaced` is for a short
 * list where each entry carries enough controls to need its own edge.
 */
export function PanelList({
  className,
  divided = true,
  ...props
}: ComponentProps<"div"> & { divided?: boolean }) {
  return (
    <div
      className={cn(
        divided ? "divide-y divide-border/60" : "space-y-2",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The vertical rhythm of one row in a `PanelList`.
 *
 * Exported for rows that keep their own layout — a row with a switch, a select
 * and three buttons is not a title and a subtitle, and rewriting each one into
 * `PanelRow` props would change behavior to win a class name. This gives them
 * the shared spacing without the shared structure.
 */
export const PANEL_ROW = "py-3 first:pt-0 last:pb-0";

export type PanelRowProps = {
  /** What this is, at a glance. Omit where a list is one kind of thing. */
  icon?: ReactNode;
  title: ReactNode;
  /** One line about it. Truncated, because a row is a row. */
  subtitle?: ReactNode;
  /** Smaller still: when it changed, who wrote it, what it belongs to. */
  meta?: ReactNode;
  /** Buttons, pinned right, where the hand already is. */
  actions?: ReactNode;
  /** Anything the row expands into. */
  children?: ReactNode;
  /** Matches the list it sits in. */
  spaced?: boolean;
  className?: string;
};

export function PanelRow({
  icon,
  title,
  subtitle,
  meta,
  actions,
  children,
  spaced = false,
  className,
}: PanelRowProps) {
  return (
    <div
      className={cn(
        spaced
          ? "rounded-md border border-border/60 p-3"
          : PANEL_ROW,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="truncate font-medium text-sm">{title}</div>
          {subtitle ? (
            <div className="truncate text-muted-foreground text-xs leading-relaxed">
              {subtitle}
            </div>
          ) : null}
          {meta ? (
            <div className="truncate text-muted-foreground text-xs">{meta}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
