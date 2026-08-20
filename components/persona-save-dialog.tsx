"use client";

import { Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { extractPersonaPlaybookDraft } from "@/lib/ai/personas/draft";

export type PersonaSaveDraft = {
  name: string;
  shortName: string;
  primaryRole?: string;
  content: string;
};

type PersonaSaveDialogProps = {
  open: boolean;
  chatId: string;
  initial: PersonaSaveDraft;
  drafting?: boolean;
  draftError?: string | null;
  onRetryDraft?: () => void;
  onOpenChange: (open: boolean) => void;
  onSaved?: (payload: {
    personaId: string;
    name?: string;
    shortName?: string;
    kickoffMessage: {
      id: string;
      role: "assistant";
      parts: Array<{ type: "text"; text: string }>;
    };
  }) => void;
};

const DRAFT_PHASES = [
  "Reading the interview…",
  "Writing persona instructions…",
  "Filling name, short name, and role…",
] as const;

function PersonaDraftProgress() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const phaseTimer = window.setInterval(() => {
      setPhaseIndex((index) => (index + 1) % DRAFT_PHASES.length);
    }, 2800);
    const progressTimer = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 92) {
          return 92;
        }
        return value + 3;
      });
    }, 450);
    return () => {
      window.clearInterval(phaseTimer);
      window.clearInterval(progressTimer);
    };
  }, []);

  const phase = DRAFT_PHASES.at(phaseIndex) ?? DRAFT_PHASES[0];

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col items-center gap-4 py-6 sm:py-8"
    >
      <Loader2
        aria-hidden="true"
        className="size-8 animate-spin text-muted-foreground"
      />
      <div className="space-y-1 text-center">
        <p className="font-medium text-sm">Drafting playbook…</p>
        <p className="text-muted-foreground text-xs">{phase}</p>
      </div>
      <Progress className="h-1.5 w-full" value={progress} />
    </div>
  );
}

export function PersonaSaveDialog({
  open,
  chatId,
  initial,
  drafting = false,
  draftError = null,
  onRetryDraft,
  onOpenChange,
  onSaved,
}: PersonaSaveDialogProps) {
  const [name, setName] = useState(initial.name);
  const [shortName, setShortName] = useState(initial.shortName);
  const [primaryRole, setPrimaryRole] = useState(initial.primaryRole ?? "");
  const [content, setContent] = useState(initial.content);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(initial.name);
    setShortName(initial.shortName);
    setPrimaryRole(initial.primaryRole ?? "");
    setContent(initial.content);
    setSetAsDefault(false);
  }, [
    open,
    initial.name,
    initial.shortName,
    initial.primaryRole,
    initial.content,
  ]);

  const dialogDescription = (() => {
    if (drafting) {
      return "Hang tight — the interview is being turned into a persona playbook.";
    }
    if (draftError) {
      return "The playbook could not be drafted. You can try again.";
    }
    return "Review the generated playbook, then save. This is what the assistant will use as its persona.";
  })();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-busy={drafting}
        className="flex max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden sm:max-w-xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Save custom persona</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        {drafting ? (
          <div className="space-y-3">
            <PersonaDraftProgress />
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  onOpenChange(false);
                }}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {draftError && !drafting ? (
          <div className="space-y-3">
            <p className="text-destructive text-sm">{draftError}</p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  onOpenChange(false);
                }}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button onClick={onRetryDraft} type="button">
                Try again
              </Button>
            </div>
          </div>
        ) : null}
        {drafting || draftError ? null : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="persona-save-name">Display name</Label>
              <Input
                id="persona-save-name"
                maxLength={200}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                value={name}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="persona-save-short">Short name</Label>
              <Input
                id="persona-save-short"
                maxLength={40}
                onChange={(e) => {
                  setShortName(e.target.value);
                }}
                placeholder="Optional compact label"
                value={shortName}
              />
              <p className="text-muted-foreground text-xs">
                Sidebar / lists can use the short name; the chat badge uses the
                display name.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="persona-save-role">Primary role</Label>
              <Input
                id="persona-save-role"
                maxLength={300}
                onChange={(e) => {
                  setPrimaryRole(e.target.value);
                }}
                placeholder="One-line description"
                value={primaryRole}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="persona-save-content">Playbook</Label>
              <Textarea
                className="min-h-48 font-mono text-xs"
                id="persona-save-content"
                maxLength={32_000}
                onChange={(e) => {
                  setContent(e.target.value);
                }}
                value={content}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={setAsDefault}
                className="size-4 rounded border"
                onChange={(e) => {
                  setSetAsDefault(e.target.checked);
                }}
                type="checkbox"
              />
              Also set as my default for new chats
            </label>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  onOpenChange(false);
                }}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  saving || !name.trim() || !shortName.trim() || !content.trim()
                }
                onClick={() => {
                  void (async () => {
                    setSaving(true);
                    try {
                      const response = await fetch(
                        `/api/chat/${chatId}/persona-confirm`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            name: name.trim(),
                            shortName: shortName.trim(),
                            primaryRole: primaryRole.trim() || undefined,
                            content: content.trim(),
                            setAsDefault,
                          }),
                        },
                      );
                      const payload = await response.json().catch(() => ({}));
                      if (!response.ok) {
                        throw new Error(
                          typeof payload.error === "string"
                            ? payload.error
                            : "Failed to save persona",
                        );
                      }
                      toast({
                        type: "success",
                        description: "Persona saved.",
                      });
                      onOpenChange(false);
                      onSaved?.({
                        personaId: payload.personaId,
                        name: name.trim(),
                        shortName: shortName.trim(),
                        kickoffMessage: payload.kickoffMessage,
                      });
                    } catch (error) {
                      toast({
                        type: "error",
                        description:
                          error instanceof Error
                            ? error.message
                            : "Failed to save persona",
                      });
                    } finally {
                      setSaving(false);
                    }
                  })();
                }}
                type="button"
              >
                {saving ? "Saving…" : "Save persona"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Prefer a proposeCustomPersona playbook; never use interview recap text. */
export function draftFromAssistantMessages(
  messages: Array<{
    role: string;
    parts?: Array<{
      type: string;
      text?: string;
      input?: unknown;
      output?: unknown;
    }>;
  }>,
): PersonaSaveDraft {
  const extracted = extractPersonaPlaybookDraft(messages);
  if (extracted) {
    return extracted;
  }
  return {
    name: "",
    shortName: "",
    content: "",
  };
}
