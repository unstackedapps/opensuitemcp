"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";

export type AgentPersonaOption = {
  id: string;
  name: string;
  primaryRole: string;
  authoredBy: "agent" | "user";
};

export type AgentKeyDraft = {
  name: string;
  personaId: string;
};

type AgentKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creating gives the agent its key; editing never touches the secret. */
  mode: "create" | "edit";
  personas: AgentPersonaOption[];
  initial?: AgentKeyDraft;
  saving: boolean;
  onSubmit: (draft: AgentKeyDraft) => void;
};

const EMPTY: AgentKeyDraft = { name: "", personaId: AVA_PERSONA_ID };

export function AgentKeyDialog({
  open,
  onOpenChange,
  mode,
  personas,
  initial,
  saving,
  onSubmit,
}: AgentKeyDialogProps) {
  const [draft, setDraft] = useState<AgentKeyDraft>(initial ?? EMPTY);

  // Reopening must not show the last agent's details, and an edit must start
  // from what the key currently holds rather than from whatever was typed last.
  useEffect(() => {
    if (open) {
      setDraft(initial ?? EMPTY);
    }
  }, [open, initial]);

  const creating = mode === "create";
  const trimmed = draft.name.trim();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{creating ? "New agent" : "Edit agent"}</DialogTitle>
          <DialogDescription>
            {creating
              ? "Name it and pick the specialist it acts as."
              : "Rename your agent and update its assigned persona."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="agent-key-name">
              Name
            </Label>
            <Input
              autoFocus
              id="agent-key-name"
              maxLength={128}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="e.g. AP review agent"
              value={draft.name}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="agent-key-persona">
              Persona
            </Label>
            <Select
              onValueChange={(personaId) =>
                setDraft((current) => ({ ...current, personaId }))
              }
              value={draft.personaId}
            >
              <SelectTrigger className="w-full text-sm" id="agent-key-persona">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {personas.map((persona) => (
                  <SelectItem key={persona.id} value={persona.id}>
                    {persona.name}
                    {persona.authoredBy === "agent"
                      ? " · written by an agent"
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            disabled={!trimmed || saving}
            onClick={() => onSubmit({ ...draft, name: trimmed })}
            type="button"
          >
            {saving
              ? creating
                ? "Creating…"
                : "Saving…"
              : creating
                ? "Create key"
                : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
