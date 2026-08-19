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
  dialogChromeButtonClassName,
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

  const copyPersonaDetails = () => {
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
  };

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
        headerActions={
          <button
            aria-label={
              copied ? "Copied persona details" : "Copy persona details"
            }
            className={dialogChromeButtonClassName}
            disabled={!content}
            onClick={copyPersonaDetails}
            type="button"
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </button>
        }
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{persona.name}</DialogTitle>
          <DialogDescription>
            {persona.shortName}
            {persona.primaryRole ? ` · ${persona.primaryRole}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/20">
          {content !== null && !isLoadingContent ? (
            <pre className="whitespace-pre-wrap wrap-break-word p-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
              {content}
            </pre>
          ) : null}
          {isLoadingContent ? (
            <div className="flex items-center gap-2 px-3 py-4 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Loading persona…
            </div>
          ) : null}
          {contentError ? (
            <p className="px-3 py-4 text-destructive text-xs">{contentError}</p>
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
