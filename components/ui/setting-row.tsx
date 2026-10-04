"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One setting: what it is on the left, the control for it on the right.
 *
 * Every settings panel had assembled this differently — a label above its
 * control here, beside it there, a bordered card around it somewhere else — and
 * the description sometimes sat under the control it described. The shape is
 * fixed now, and the only line is the one between two rows.
 *
 * The label names the control, so the control does not repeat it: a switch
 * beside "Use memory in chats" needs no caption, and a picker beside "Language"
 * needs no field label.
 *
 * The control centers against the block it belongs to, and every row carries the
 * same padding top and bottom. Pinned to the top the control sat hard against
 * the rule above it, and a first row with no top padding sat flush under the
 * header with all its space below — both read as a row out of true.
 */
export function SettingRow({
  title,
  description,
  control,
  children,
  className,
}: {
  title: ReactNode;
  /** Why someone would change it, or what changes when they do. */
  description?: ReactNode;
  /** The switch, select or button. Pinned right, where the hand goes. */
  control?: ReactNode;
  /** Anything the setting expands into, below both columns. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-3.5", className)}>
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-sm">{title}</p>
          {description ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {control ? <div className="shrink-0">{control}</div> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * A run of settings under one heading.
 *
 * The heading carries the space; there is no rule under it and no box around
 * the rows, so a panel reads as a column of settings rather than a stack of
 * cards.
 */
export function SettingSection({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-1", className)}>
      {title ? (
        <h3 className="pb-2 font-medium text-sm">{title}</h3>
      ) : null}
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  );
}
