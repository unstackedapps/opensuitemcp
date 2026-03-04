"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Response } from "./response";

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  completedDuration: number;
  elapsedSeconds: number;
  reasoningText: string;
};

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  /** When false, show "X for 0s" but don't run the timer. Used for diffusion pre-processing. Defaults to isStreaming. */
  timerActive?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
  reasoningText?: string;
  onCompleted?: (duration: number) => void;
};

const MS_IN_S = 1000;
// Match bold markdown on its own line: **Header**
const BOLD_HEADER_REGEX = /^\*\*(.+?)\*\*$/gm;
const BOLD_CLEANUP_REGEX = /^\*\*(.+?)\*\*$/;

// Extract the latest step header from reasoning text
// Looks for bold markdown (**Header**) - these get converted to <strong> by streamdown
function extractLatestStepHeader(reasoningText: string): string | null {
  if (!reasoningText || !reasoningText.trim()) {
    return null;
  }

  // Try bold markdown headers (**Header**) on their own line
  const headerMatches = reasoningText.match(BOLD_HEADER_REGEX);
  if (headerMatches && headerMatches.length > 0) {
    const lastHeader = headerMatches.at(-1);
    if (lastHeader) {
      // Remove the ** markers
      const headerText = lastHeader.replace(BOLD_CLEANUP_REGEX, "$1").trim();
      return headerText || null;
    }
  }

  return null;
}

export const Reasoning = ({
  className,
  isStreaming = false,
  timerActive,
  open,
  defaultOpen = true,
  onOpenChange,
  duration: durationProp,
  reasoningText = "",
  onCompleted,
  children,
  ...props
}: ReasoningProps) => {
  const runTimer = timerActive ?? isStreaming;

  const [isOpen, setIsOpen] = useControllableState({
    prop: open,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });
  const [completedDuration, setCompletedDuration] = useControllableState({
    prop: durationProp,
    defaultProp: 0,
  });

  const streamStartRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Track duration when streaming starts and ends
  useEffect(() => {
    if (isStreaming && runTimer) {
      if (streamStartRef.current === null) {
        streamStartRef.current = Date.now();
        setElapsedSeconds(0);
      }
    } else if (!runTimer && streamStartRef.current !== null) {
      streamStartRef.current = null;
      setElapsedSeconds(0);
    } else if (!isStreaming && streamStartRef.current !== null) {
      const duration = Math.round(
        (Date.now() - streamStartRef.current) / MS_IN_S,
      );
      setCompletedDuration(duration);
      streamStartRef.current = null;
      setElapsedSeconds(0);
      onCompleted?.(duration);
    }
  }, [isStreaming, runTimer, setCompletedDuration, onCompleted]);

  // Update elapsed time while streaming (only when timer is active)
  useEffect(() => {
    if (!isStreaming || !runTimer) {
      return;
    }

    const updateElapsed = () => {
      if (streamStartRef.current === null) {
        return;
      }

      setElapsedSeconds(
        Math.max(
          0,
          Math.round((Date.now() - streamStartRef.current) / MS_IN_S),
        ),
      );
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, MS_IN_S);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isStreaming, runTimer]);

  // Don't auto-open/close - let user control it manually

  const handleOpenChange = (newOpen: boolean) => {
    setIsOpen(newOpen);
  };

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      isStreaming,
      isOpen,
      setIsOpen,
      completedDuration,
      elapsedSeconds,
      reasoningText,
    }),
    [
      isStreaming,
      isOpen,
      setIsOpen,
      completedDuration,
      elapsedSeconds,
      reasoningText,
    ],
  );

  return (
    <ReasoningContext.Provider value={contextValue}>
      <Collapsible
        className={cn("not-prose", className)}
        onOpenChange={handleOpenChange}
        open={isOpen}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
};

export type ReasoningTriggerProps = ComponentProps<
  typeof CollapsibleTrigger
> & {
  icon?: React.ReactNode;
  label?: string;
  completedLabel?: string;
  showHeaderBadge?: boolean;
};

export const ReasoningTrigger = ({
  className,
  icon,
  label,
  completedLabel,
  showHeaderBadge = true,
  children,
  ...props
}: ReasoningTriggerProps) => {
  const {
    isStreaming,
    isOpen,
    completedDuration,
    elapsedSeconds,
    reasoningText,
  } = useReasoning();
  const latestStepHeader = extractLatestStepHeader(reasoningText || "");
  const thoughtMatches = reasoningText.match(BOLD_HEADER_REGEX) ?? [];
  const thoughtCount = Math.max(thoughtMatches.length, 1);

  return (
    <CollapsibleTrigger
      className={cn(
        "flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <span
            className={cn(
              "inline-flex shrink-0 transition-transform duration-300",
              icon && !isStreaming && "rotate-100",
            )}
          >
            {icon ?? <BrainIcon className="size-4" />}
          </span>
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <>
                <p>
                  {label
                    ? `${label} for ${elapsedSeconds}s`
                    : `Thinking for ${elapsedSeconds}s`}
                </p>
                {showHeaderBadge && latestStepHeader && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <Badge
                      className="h-5 rounded-full px-2 font-normal text-xs"
                      variant="outline"
                    >
                      {latestStepHeader}
                    </Badge>
                  </>
                )}
              </>
            ) : (
              <>
                {label ? (
                  <p>
                    {completedDuration > 0
                      ? `${completedLabel ?? label} in ${completedDuration}s`
                      : (completedLabel ?? label)}
                  </p>
                ) : completedDuration > 0 ? (
                  <p>Thought for {completedDuration}s</p>
                ) : (
                  <p>
                    {thoughtCount} Thought{thoughtCount === 1 ? "" : "s"}
                  </p>
                )}
                {showHeaderBadge && latestStepHeader && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <Badge
                      className="h-5 rounded-full px-2 font-normal text-xs"
                      variant="outline"
                    >
                      {latestStepHeader}
                    </Badge>
                  </>
                )}
              </>
            )}
          </div>
          <ChevronDownIcon
            className={cn(
              "size-3 text-muted-foreground transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </>
      )}
    </CollapsibleTrigger>
  );
};

export type ReasoningContentProps = ComponentProps<
  typeof CollapsibleContent
> & {
  children: string;
  isPlainText?: boolean;
};

export const ReasoningContent = memo(
  ({
    className,
    children,
    isPlainText = false,
    ...props
  }: ReasoningContentProps) => (
    <CollapsibleContent
      className={cn(
        "mt-2 text-muted-foreground text-xs",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-hidden data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      {...props}
    >
      {isPlainText ? (
        <div className="max-h-[200px] overflow-y-auto whitespace-pre-wrap">
          {children}
        </div>
      ) : (
        <div className="max-h-[200px] overflow-y-auto">
          <Response className="grid gap-2">{children}</Response>
        </div>
      )}
    </CollapsibleContent>
  ),
);

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
