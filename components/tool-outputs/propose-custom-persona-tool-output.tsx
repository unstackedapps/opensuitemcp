"use client";

import { useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProposeCustomPersonaResult } from "@/lib/ai/personas/interview";

type ProposeCustomPersonaToolOutputProps = {
  chatId: string;
  result: ProposeCustomPersonaResult;
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
  onRevise?: (feedback: string) => void;
};

export function ProposeCustomPersonaToolOutput({
  chatId,
  result,
  onSaved,
  onRevise,
}: ProposeCustomPersonaToolOutputProps) {
  const [name, setName] = useState(result.ok ? result.name : "");
  const [shortName, setShortName] = useState(result.ok ? result.shortName : "");
  const [content, setContent] = useState(result.ok ? result.content : "");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviseText, setReviseText] = useState("");
  const [saved, setSaved] = useState(false);

  if (!result.ok) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <p className="font-medium">Interview incomplete</p>
        <p className="text-muted-foreground text-xs">
          Still need: {result.missing.join(", ")}
        </p>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Persona saved.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="font-medium text-sm">Proposed persona</p>
      <div className="space-y-1.5">
        <Label htmlFor={`propose-name-${chatId}`}>Name</Label>
        <Input
          id={`propose-name-${chatId}`}
          maxLength={200}
          onChange={(e) => {
            setName(e.target.value);
          }}
          value={name}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`propose-short-${chatId}`}>Short name</Label>
        <Input
          id={`propose-short-${chatId}`}
          maxLength={40}
          onChange={(e) => {
            setShortName(e.target.value);
          }}
          value={shortName}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`propose-content-${chatId}`}>Playbook</Label>
        <Textarea
          className="min-h-48 font-mono text-xs"
          id={`propose-content-${chatId}`}
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
      <div className="flex flex-wrap gap-2">
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
                      primaryRole: result.primaryRole,
                      content: content.trim(),
                      setAsDefault,
                    }),
                  },
                );
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                  throw new Error(
                    typeof data.error === "string"
                      ? data.error
                      : "Failed to save persona",
                  );
                }
                setSaved(true);
                onSaved?.({
                  personaId: data.personaId,
                  name: name.trim(),
                  shortName: shortName.trim(),
                  kickoffMessage: data.kickoffMessage,
                });
                toast({
                  type: "success",
                  description: "Persona saved. Continuing in this chat.",
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
        <Button
          disabled={saving}
          onClick={() => {
            const feedback =
              reviseText.trim() ||
              "Please revise the playbook based on my answers so far.";
            onRevise?.(feedback);
            setReviseText("");
          }}
          type="button"
          variant="outline"
        >
          Revise…
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`propose-revise-${chatId}`}>Revision notes</Label>
        <Input
          id={`propose-revise-${chatId}`}
          onChange={(e) => {
            setReviseText(e.target.value);
          }}
          placeholder="Optional feedback for Revise…"
          value={reviseText}
        />
      </div>
    </div>
  );
}
