"use client";

import { CircleHelp, ExternalLink } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PanelHeaderLink = { label: string; href: string };

/**
 * The top of every panel in the portal, at one height.
 *
 * Eight panels had written their own, and they disagreed on padding, on
 * whether the title row and the actions shared a line, and on how documentation
 * links were laid out. `min-h-16` holds the floor so switching panels does not
 * move the content underneath.
 *
 * No rule under it, and no icon in it. The icon is in the nav row that opened
 * this panel, and a line here is the first of several the eye has to cross
 * before reaching anything it came for — space separates these just as well.
 *
 * Links live behind one control rather than in the row. Stacked, three of them
 * made Skills taller than every panel beside it; laid across, they took the
 * width the subtitle needed and left it wrapping in a column. A button is the
 * same size whatever it opens.
 */
export function PanelHeader({
  title,
  subtitle,
  actions,
  links,
  className,
}: {
  title: ReactNode;
  /** One line about the panel. Two at most; this is not documentation. */
  subtitle?: ReactNode;
  /** Controls for the panel as a whole, pinned right. */
  actions?: ReactNode;
  /** Outbound documentation, laid out across rather than down. */
  links?: PanelHeaderLink[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-16 shrink-0 items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="font-medium text-base">{title}</h2>
        {subtitle ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions || (links && links.length > 0) ? (
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {links && links.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Documentation"
                  className="size-7 text-muted-foreground"
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <CircleHelp className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
                  Documentation
                </DropdownMenuLabel>
                {links.map((link) => (
                  <DropdownMenuItem asChild key={link.href}>
                    <a
                      href={link.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <span className="flex-1">{link.label}</span>
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Everything under a `PanelHeader`, at the same offset in every panel.
 *
 * The header was shared and the body was not, so each panel improvised its own
 * gutters and its own first gap — Chats sat 4px lower than Artifacts because
 * one wrapper added `pt-1` on top of the other's `pt-4`. Declaring it once is
 * the only way the first row of two panels lands on the same line.
 */
export function PanelBody({
  className,
  ...props
}: ComponentProps<"div"> & { className?: string }) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4 sm:px-5",
        className,
      )}
      {...props}
    />
  );
}
