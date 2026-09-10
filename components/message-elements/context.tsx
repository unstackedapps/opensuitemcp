"use client";

import type { ComponentProps } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import type { ContextBreakdownId } from "@/lib/ai/context-breakdown-types";
import type { AppUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";

export type ContextProps = ComponentProps<"button"> & {
  /** Optional full usage payload to enable breakdown view */
  usage?: AppUsage;
};

const PERCENT_MAX = 100;

// Lucide CircleIcon geometry
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_RADIUS = 10;
const ICON_STROKE_WIDTH = 2;

const CATEGORY_COLORS: Record<ContextBreakdownId, string> = {
  system: "bg-zinc-400",
  persona: "bg-violet-400",
  skills: "bg-amber-400/90",
  knowledge: "bg-emerald-400/90",
  tools: "bg-fuchsia-400/90",
  conversation: "bg-orange-500/90",
};

type ContextIconProps = {
  percent: number; // 0 - 100
};

export const ContextIcon = ({ percent }: ContextIconProps) => {
  const radius = ICON_RADIUS;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / PERCENT_MAX);

  return (
    <svg
      aria-label={`${percent.toFixed(2)}% of model context used`}
      height="28"
      role="img"
      style={{ color: "currentcolor" }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="28"
    >
      <title>{`${percent.toFixed(1)}% of model context used`}</title>
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={radius}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.7"
        r={radius}
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        transform={`rotate(-90 ${ICON_CENTER} ${ICON_CENTER})`}
      />
    </svg>
  );
};

/** Compact token count: 504, 1.2K, 103.8K, 1.3M */
export function formatCompactTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return "0";
  }
  if (n < 1000) {
    return String(Math.round(n));
  }
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}K`;
  }
  const m = n / 1_000_000;
  return `${m >= 100 ? Math.round(m) : Number(m.toFixed(1))}M`;
}

function getUsageMetrics(usage?: AppUsage) {
  const inputUsed = usage?.inputTokens ?? 0;
  const total =
    usage?.totalTokens ??
    (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  const max =
    usage?.context?.totalMax ??
    usage?.context?.combinedMax ??
    usage?.context?.inputMax;
  const used = inputUsed > 0 ? inputUsed : total;
  const hasMax = typeof max === "number" && Number.isFinite(max) && max > 0;
  const percent = hasMax ? Math.min(100, (used / max) * 100) : 0;

  return {
    used,
    max,
    percent,
    hasMax,
    breakdown: usage?.breakdown?.filter((part) => part.tokens > 0) ?? [],
  };
}

function InfoRow({
  label,
  tokens,
  costText,
}: {
  label: string;
  tokens?: number;
  costText?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 font-mono">
        <span className="min-w-[4ch] text-right">
          {tokens === undefined ? "—" : tokens.toLocaleString()}
        </span>
        {costText !== undefined &&
          costText !== null &&
          !Number.isNaN(Number.parseFloat(costText)) && (
            <span className="text-muted-foreground">
              ${Number.parseFloat(costText).toFixed(6)}
            </span>
          )}
      </div>
    </div>
  );
}

function SegmentedBar({
  parts,
  used,
  max,
}: {
  parts: NonNullable<AppUsage["breakdown"]>;
  used: number;
  max?: number;
}) {
  const partsSum = parts.reduce((sum, part) => sum + part.tokens, 0);
  const barTotal =
    typeof max === "number" && Number.isFinite(max) && max > 0
      ? max
      : Math.max(used, partsSum, 1);

  return (
    <div
      aria-hidden
      className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      {parts.map((part) => {
        const widthPct = (part.tokens / barTotal) * 100;
        if (widthPct <= 0) {
          return null;
        }
        return (
          <div
            className={cn("h-full min-w-px shrink-0", CATEGORY_COLORS[part.id])}
            key={part.id}
            style={{ width: `${widthPct}%` }}
            title={`${part.label}: ${formatCompactTokens(part.tokens)}`}
          />
        );
      })}
    </div>
  );
}

function UsageBillRows({ usage }: { usage?: AppUsage }) {
  const totalUsd = usage?.costUSD?.totalUSD;
  let totalCostText: string | null = null;
  if (totalUsd !== undefined) {
    const parsed = Number.parseFloat(totalUsd.toString());
    totalCostText = Number.isNaN(parsed) ? "—" : `$${parsed.toFixed(6)}`;
  }

  return (
    <div className="space-y-1">
      {(usage?.cachedInputTokens ?? 0) > 0 ? (
        <InfoRow
          costText={usage?.costUSD?.cacheReadUSD?.toString()}
          label="Cache Hits"
          tokens={usage?.cachedInputTokens}
        />
      ) : null}
      <InfoRow
        costText={usage?.costUSD?.inputUSD?.toString()}
        label="Input"
        tokens={usage?.inputTokens}
      />
      <InfoRow
        costText={usage?.costUSD?.outputUSD?.toString()}
        label="Output"
        tokens={usage?.outputTokens}
      />
      {(usage?.reasoningTokens ?? 0) > 0 ? (
        <InfoRow
          costText={usage?.costUSD?.reasoningUSD?.toString()}
          label="Reasoning"
          tokens={usage?.reasoningTokens}
        />
      ) : null}
      {totalCostText ? (
        <>
          <Separator className="mt-1" />
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-muted-foreground">Total cost</span>
            <span className="font-mono">{totalCostText}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ContextUsageBody({ usage }: { usage?: AppUsage }) {
  const { used, max, percent, hasMax, breakdown } = getUsageMetrics(usage);
  const amount = hasMax
    ? `~${formatCompactTokens(used)} / ${formatCompactTokens(max ?? 0)}`
    : `~${formatCompactTokens(used)}`;

  return (
    <div className="space-y-3">
      <div>
        <div className="font-medium text-sm">Context</div>
        <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {hasMax ? `${Math.round(percent)}% used` : "Usage"}
          </span>
          <span className="font-mono text-muted-foreground tabular-nums">
            {amount}
          </span>
        </div>
      </div>
      {breakdown.length > 0 ? (
        <>
          <SegmentedBar max={max} parts={breakdown} used={used} />
          <ul className="space-y-1.5">
            {breakdown.map((part) => (
              <li
                className="flex items-center justify-between gap-3 text-xs"
                key={part.id}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 shrink-0 rounded-[2px]",
                      CATEGORY_COLORS[part.id],
                    )}
                  />
                  <span className="truncate text-foreground/90">
                    {part.label}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                  {formatCompactTokens(part.tokens)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/40"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <Separator />
      <UsageBillRows usage={usage} />
    </div>
  );
}

export const Context = ({ className, usage, ...props }: ContextProps) => {
  const { percent } = getUsageMetrics(usage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex cursor-pointer select-none items-center gap-1 rounded-md bg-background text-foreground text-sm",
            "outline-none ring-offset-background",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className,
          )}
          {...props}
          type="button"
        >
          <ContextIcon percent={percent} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-3" side="top">
        <ContextUsageBody usage={usage} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
