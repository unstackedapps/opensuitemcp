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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

export type AgentAccountOption = {
  accountId: string;
  label: string;
  connected: boolean;
};

/** How the agent proves itself. Chosen once, at creation. */
export type AgentConnectionMethod = "key" | "signin";

export type AgentDraft = {
  name: string;
  personaId: string;
  /** Null follows whichever account is active at the time of the call. */
  netsuiteAccountId: string | null;
  method: AgentConnectionMethod;
};

type AgentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creating settles the connection method; editing never revisits it. */
  mode: "create" | "edit";
  personas: AgentPersonaOption[];
  accounts: AgentAccountOption[];
  initial?: AgentDraft;
  saving: boolean;
  onSubmit: (draft: AgentDraft) => void;
};

/**
 * The one place an agent is created.
 *
 * Both connection methods come from here, because an agent is one thing and
 * how it authenticates is one of its fields. The alternative — a second setup
 * form living inside the OAuth consent screen — meant the same agent could be
 * created two ways, with the two forms free to drift apart. They did.
 */

/**
 * Radix refuses an empty `value` on a Select item, so "follow my active
 * account" needs a sentinel. It is mapped back to null on submit.
 */
const FOLLOW_ACTIVE_ACCOUNT = "__any__";

const EMPTY: AgentDraft = {
  name: "",
  personaId: AVA_PERSONA_ID,
  netsuiteAccountId: null,
  method: "key",
};

export function AgentDialog({
  open,
  onOpenChange,
  mode,
  personas,
  accounts,
  initial,
  saving,
  onSubmit,
}: AgentDialogProps) {
  const [draft, setDraft] = useState<AgentDraft>(initial ?? EMPTY);

  // Reopening must not show the last agent's details, and an edit must start
  // from what the agent currently holds rather than from whatever was typed
  // last.
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
              ? "Name it, pick the specialist it acts as, and choose how it connects."
              : "Rename your agent and update what it acts as."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="agent-name">
              Name
            </Label>
            <Input
              autoFocus
              id="agent-name"
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
            <Label className="text-xs" htmlFor="agent-persona">
              Persona
            </Label>
            <Select
              onValueChange={(personaId) =>
                setDraft((current) => ({ ...current, personaId }))
              }
              value={draft.personaId}
            >
              <SelectTrigger className="w-full text-sm" id="agent-persona">
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

          {accounts.length > 0 ? (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="agent-account">
                NetSuite account
              </Label>
              <Select
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    netsuiteAccountId:
                      value === FOLLOW_ACTIVE_ACCOUNT ? null : value,
                  }))
                }
                value={draft.netsuiteAccountId ?? FOLLOW_ACTIVE_ACCOUNT}
              >
                <SelectTrigger className="w-full text-sm" id="agent-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FOLLOW_ACTIVE_ACCOUNT}>
                    Follow my active account
                  </SelectItem>
                  {accounts.map((account) => (
                    <SelectItem
                      key={account.accountId}
                      value={account.accountId}
                    >
                      {account.label}
                      {account.connected ? "" : " · not connected"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {creating ? (
            <div className="space-y-2">
              <Label className="text-xs">Connects by</Label>
              <RadioGroup
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    method: value as AgentConnectionMethod,
                  }))
                }
                value={draft.method}
              >
                <MethodOption
                  description="Paste a secret into the client. Works anywhere, including without HTTPS."
                  label="Agent key"
                  value="key"
                />
                <MethodOption
                  description="The client sends you here to approve it, then refreshes its own access."
                  label="Sign-in"
                  value="signin"
                />
              </RadioGroup>
            </div>
          ) : null}
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
                ? "Create agent"
                : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MethodOption({
  value,
  label,
  description,
}: {
  value: AgentConnectionMethod;
  label: string;
  description: string;
}) {
  return (
    <Label
      className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 has-[:checked]:border-primary/60 has-[:checked]:bg-muted/50"
      htmlFor={`agent-method-${value}`}
    >
      <RadioGroupItem
        className="mt-0.5"
        id={`agent-method-${value}`}
        value={value}
      />
      <span>
        <span className="block font-medium text-sm">{label}</span>
        <span className="block text-muted-foreground text-xs leading-relaxed">
          {description}
        </span>
      </span>
    </Label>
  );
}
