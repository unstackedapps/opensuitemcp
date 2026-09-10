"use client";

import type { ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatMcpToolInput } from "@/lib/mcp/format-tool-display";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

function StickyNoteOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Empty result</title>
      <path d="M15 3v5a1 1 0 0 0 1 1h5" />
      <path d="m2 2 20 20" />
      <path d="M3.586 3.586A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.414-.586" />
      <path d="M8.656 3H15a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 21 9v6.344" />
    </svg>
  );
}

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "not-prose group mb-4 w-full min-w-0 max-w-full overflow-hidden rounded-md border",
      className,
    )}
    {...props}
  />
);

export type ToolHeaderProps = {
  type: ToolUIPart["type"];
  state: ToolUIPart["state"];
  emptyResult?: boolean;
  className?: string;
};

const TOOL_STATE_LABELS: Record<ToolUIPart["state"], string> = {
  "input-streaming": "Pending",
  "input-available": "Running",
  "output-available": "Completed",
  "output-error": "Error",
  "approval-requested": "Approval requested",
  "approval-responded": "Approval responded",
  "output-denied": "Denied",
};

const TOOL_STATE_ICONS: Record<ToolUIPart["state"], ReactNode> = {
  "input-streaming": <CircleIcon className="size-4" />,
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
  "output-error": <XCircleIcon className="size-4 text-red-600" />,
  "approval-requested": <ClockIcon className="size-4" />,
  "approval-responded": <CheckCircleIcon className="size-4" />,
  "output-denied": <XCircleIcon className="size-4 text-red-600" />,
};

const getStatusBadge = (status: ToolUIPart["state"], emptyResult = false) => {
  const isEmptyResult = emptyResult && status === "output-available";
  return (
    <Badge
      className="flex items-center gap-1 rounded-full text-xs"
      variant="secondary"
    >
      {isEmptyResult ? (
        <StickyNoteOffIcon className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        TOOL_STATE_ICONS[status]
      )}
      <span>{isEmptyResult ? "Empty Result" : TOOL_STATE_LABELS[status]}</span>
    </Badge>
  );
};

export const ToolHeader = ({
  className,
  type,
  state,
  emptyResult = false,
  ...props
}: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full min-w-0 max-w-full items-center justify-between gap-2 p-3",
      className,
    )}
    {...props}
  >
    <div className="flex min-w-0 max-w-full flex-1 items-center gap-2">
      <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium text-sm">{type}</span>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {getStatusBadge(state, emptyResult)}
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </div>
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({
  className,
  children,
  ...props
}: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 min-w-0 max-w-full text-popover-foreground outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  >
    <section
      aria-label="Tool call details"
      className="max-h-[min(24rem,55dvh)] min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain"
    >
      {children}
    </section>
  </CollapsibleContent>
);

export type ToolInputProps = {
  className?: string;
  input: ToolUIPart["input"];
};

export const ToolInput = ({ className, input }: ToolInputProps) => {
  const payload = formatMcpToolInput(input);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible
      className={cn("min-w-0 max-w-full", className)}
      onOpenChange={setIsOpen}
      open={isOpen}
    >
      <CollapsibleTrigger
        className="flex w-full min-w-0 items-center gap-1 px-3 py-2 text-left"
        type="button"
      >
        <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide md:text-xs">
          Arguments
        </span>
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            isOpen ? "rotate-90" : null,
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {isOpen ? (
          <div className="min-w-0 max-w-full px-3 pb-2">
            <CodeBlock code={payload.code} language={payload.language} />
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ReactNode;
  errorText: ToolUIPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  return (
    <div
      className={cn("min-w-0 max-w-full space-y-1 px-3 py-2", className)}
      {...props}
    >
      <h4 className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide md:text-xs">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "min-w-0 max-w-full wrap-break-word text-xs [&_table]:w-auto [&_table]:min-w-full",
          errorText
            ? "rounded-md bg-destructive/10 p-2 text-destructive"
            : null,
        )}
      >
        {output ? <div className="min-w-0 max-w-full">{output}</div> : null}
        {output || !errorText ? null : (
          <div className="min-w-0 max-w-full">{errorText}</div>
        )}
      </div>
    </div>
  );
};
