"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PersonaDetailsTarget = {
  id: string;
  name: string;
  shortName: string;
  primaryRole: string;
};

type PersonaDetailsDialogProps = {
  persona: PersonaDetailsTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set (custom personas), skip the fetch. */
  inlineContent?: string | null;
};

export function PersonaDetailsDialog({
  persona,
  open,
  onOpenChange,
  inlineContent,
}: PersonaDetailsDialogProps) {
  const [content, setContent] = useState<string | null>(inlineContent ?? null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (inlineContent !== undefined) {
      setContent(inlineContent);
    }
  }, [inlineContent]);

  useEffect(() => {
    if (!open || content !== null) {
      return;
    }

    let cancelled = false;
    setIsLoadingContent(true);
    setContentError(null);

    void (async () => {
      try {
        const response = await fetch(
          `/api/personas/${encodeURIComponent(persona.id)}`,
        );
        if (!response.ok) {
          throw new Error("Failed to load persona details");
        }
        const payload = (await response.json()) as { content?: string };
        if (!cancelled) {
          setContent(payload.content ?? "");
        }
      } catch (error) {
        if (!cancelled) {
          setContentError(
            error instanceof Error
              ? error.message
              : "Failed to load persona details",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingContent(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [content, open, persona.id]);

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setCopied(false);
        }
      }}
      open={open}
    >
      <DialogContent
        className="flex max-h-[min(85vh,40rem)] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-3 overflow-hidden sm:max-w-2xl"
        data-testid="persona-details-dialog"
      >
        <DialogHeader className="shrink-0 pr-8">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1.5">
              <DialogTitle>{persona.name}</DialogTitle>
              <DialogDescription>
                {persona.shortName}
                {persona.primaryRole ? ` · ${persona.primaryRole}` : ""}
              </DialogDescription>
            </div>
            <Button
              aria-label="Copy persona details"
              className="size-8 shrink-0"
              disabled={!content || isLoadingContent}
              onClick={() => {
                if (!content) {
                  return;
                }
                void navigator.clipboard.writeText(content).then(
                  () => {
                    setCopied(true);
                    toast({
                      type: "success",
                      description: "Copied to clipboard!",
                    });
                    window.setTimeout(() => {
                      setCopied(false);
                    }, 1500);
                  },
                  () => {
                    toast({
                      type: "error",
                      description: "Copy to clipboard is not supported",
                    });
                  },
                );
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/20">
          {isLoadingContent ? (
            <div className="flex items-center gap-2 px-3 py-4 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Loading persona…
            </div>
          ) : null}
          {contentError ? (
            <p className="px-3 py-4 text-destructive text-xs">{contentError}</p>
          ) : null}
          {content !== null && !isLoadingContent ? (
            <pre className="whitespace-pre-wrap wrap-break-word px-3 py-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
              {content}
            </pre>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type PersonaDetailsLinkProps = {
  persona: PersonaDetailsTarget;
  /** When set (custom personas), skip the fetch. */
  inlineContent?: string | null;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
};

export function PersonaDetailsLink({
  persona,
  inlineContent,
  onOpenChange,
  testId,
}: PersonaDetailsLinkProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <Button
        className="h-7 px-0 text-xs"
        data-testid={testId ?? `persona-details-${persona.id}`}
        onClick={() => {
          setDetailsOpen(true);
          onOpenChange?.(true);
        }}
        size="sm"
        type="button"
        variant="link"
      >
        Details
      </Button>
      <PersonaDetailsDialog
        inlineContent={inlineContent}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          onOpenChange?.(open);
        }}
        open={detailsOpen}
        persona={persona}
      />
    </>
  );
}
