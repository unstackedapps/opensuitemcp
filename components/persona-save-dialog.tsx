"use client";

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
import { Textarea } from "@/components/ui/textarea";

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

export function PersonaSaveDialog({
  open,
  chatId,
  initial,
  onOpenChange,
  onSaved,
}: PersonaSaveDialogProps) {
  const [name, setName] = useState(initial.name);
  const [shortName, setShortName] = useState(initial.shortName);
  const [content, setContent] = useState(initial.content);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(initial.name);
    setShortName(initial.shortName);
    setContent(initial.content);
    setSetAsDefault(false);
  }, [open, initial.name, initial.shortName, initial.content]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Save custom persona</DialogTitle>
          <DialogDescription>
            Review the playbook, then save. This is what actually persists the
            persona — chat text alone does not.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
                          primaryRole: initial.primaryRole,
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
      </DialogContent>
    </Dialog>
  );
}

/** Pull a draft playbook from the latest assistant text in the interview. */
export function draftFromAssistantMessages(
  messages: Array<{
    role: string;
    parts?: Array<{ type: string; text?: string }>;
  }>,
): PersonaSaveDraft {
  let text = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages.at(i);
    if (message?.role !== "assistant" || !message.parts) {
      continue;
    }
    const chunks = message.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text?.trim() ?? "")
      .filter(Boolean);
    if (chunks.length > 0) {
      text = chunks.join("\n\n");
      break;
    }
  }

  const nameMatch = text.match(/\*\*Name:\*\*\s*(.+)/i);
  const shortMatch = text.match(/\*\*Short Name:\*\*\s*(.+)/i);
  const roleMatch = text.match(/\*\*Primary Role:\*\*\s*(.+)/i);
  const titleMatch = text.match(/^#\s+OpenSuiteMCP Persona:\s*(.+)$/im);

  const name =
    nameMatch?.[1]?.trim() ||
    titleMatch?.[1]?.trim() ||
    "Custom NetSuite Persona";
  const shortName =
    shortMatch?.[1]?.trim() || name.split(/\s+/).at(0) || "Custom";

  return {
    name: name.slice(0, 200),
    shortName: shortName.slice(0, 40),
    primaryRole: roleMatch?.[1]?.trim()?.slice(0, 300),
    content:
      text.trim().length > 40
        ? text.trim().slice(0, 32_000)
        : `# OpenSuiteMCP Persona: ${name}

## Persona Metadata

- **Name:** ${name}
- **Short Name:** ${shortName}
- **Primary Role:** ${roleMatch?.[1]?.trim() || "Custom NetSuite specialist"}

## Persona Instructions

(Paste or edit the full playbook from the interview here.)
`,
  };
}
