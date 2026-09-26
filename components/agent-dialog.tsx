"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

/** How the agent app proves itself. Chosen once, at creation. */
export type AgentConnectionMethod = "key" | "signin";

export type AgentDraft = {
  name: string;
  /** Free text: which laptop, which account, whose Claude. */
  description: string;
  personaId: string;
  /** Null follows whichever account is active at the time of the call. */
  netsuiteAccountId: string | null;
  method: AgentConnectionMethod;
  /** Sign-in only: the connector wants an ID and secret, not to self-register. */
  issueClientCredentials: boolean;
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
 * The one place an agent app is created.
 *
 * An agent app is the application: it holds the name, the persona, the account
 * and whichever credential connects it. Everything it needs is issued from
 * here — including a client ID and secret, which used to be a separate object
 * in a peer tab and read as a second thing to build. It was never that; it is
 * a property of an app whose connector happens to demand one.
 */

/**
 * Radix refuses an empty `value` on a Select item, so "follow my active
 * account" needs a sentinel. It is mapped back to null on submit.
 */
const FOLLOW_ACTIVE_ACCOUNT = "__any__";

const EMPTY: AgentDraft = {
  name: "",
  description: "",
  personaId: AVA_PERSONA_ID,
  netsuiteAccountId: null,
  method: "key",
  issueClientCredentials: false,
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
          <DialogTitle>
            {creating ? "New agent app" : "Edit agent app"}
          </DialogTitle>
          <DialogDescription>
            {creating
              ? "Name it, pick the specialist it acts as, and choose how it connects."
              : "Rename it and update what it acts as."}
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
            <Label className="text-xs" htmlFor="agent-description">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="agent-description"
              maxLength={256}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="e.g. My personal Claude account"
              value={draft.description}
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
                      {account.label === account.accountId
                        ? account.accountId
                        : `${account.label} · ${account.accountId}`}
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
                  description="Paste a secret into the app. Works anywhere, including without HTTPS."
                  label="Agent key"
                  suffix="bearer token"
                  value="key"
                />
                <MethodOption
                  description="The app sends you here to approve it, then refreshes its own access."
                  label="Sign-in"
                  suffix="OAuth 2.1"
                  value="signin"
                />
              </RadioGroup>

              {draft.method === "signin" ? (
                <label
                  className="flex cursor-pointer items-start gap-2.5 pt-0.5"
                  htmlFor="agent-client-credentials"
                >
                  <Checkbox
                    checked={draft.issueClientCredentials}
                    className="mt-0.5"
                    id="agent-client-credentials"
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        issueClientCredentials: checked === true,
                      }))
                    }
                  />
                  <span>
                    <span className="block text-xs">
                      This connector asks for a client ID and secret
                    </span>
                    <span className="block text-muted-foreground text-xs leading-relaxed">
                      Gemini does. Most — Claude, Cursor, VS Code — register
                      themselves and need nothing here.
                    </span>
                  </span>
                </label>
              ) : null}
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
            onClick={() =>
              onSubmit({
                ...draft,
                name: trimmed,
                description: draft.description.trim(),
              })
            }
            type="button"
          >
            {saving
              ? creating
                ? "Creating…"
                : "Saving…"
              : creating
                ? "Create app"
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
  suffix,
  description,
}: {
  value: AgentConnectionMethod;
  label: string;
  /** The protocol name, for matching what a connector's own dialog says. */
  suffix: string;
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
        <span className="block font-medium text-sm">
          {label}{" "}
          <span className="font-normal text-muted-foreground text-xs">
            {suffix}
          </span>
        </span>
        <span className="block text-muted-foreground text-xs leading-relaxed">
          {description}
        </span>
      </span>
    </Label>
  );
}
