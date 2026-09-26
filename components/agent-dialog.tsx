"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { KNOWN_CALLBACK_URLS, METHOD_NAMES } from "@/lib/mcp/connect-clients";

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
  description: string;
  /** Null follows whichever account is active at the time of the call. */
  netsuiteAccountId: string | null;
  personaId: string;
  method: AgentConnectionMethod;
  /** OAuth only: the connector wants an ID and secret, not to self-register. */
  issueClientCredentials: boolean;
  /** Where that connector expects to be sent back. Required with credentials. */
  callbackUrl: string;
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
 * Two columns and no descriptions. The people using this configure NetSuite
 * for a living; "Bearer auth" and "OAuth 2.1" are their words already, and a
 * sentence under each one only makes the dialog taller than the screen.
 */

/** Radix refuses an empty `value`, so "follow my active account" needs one. */
const FOLLOW_ACTIVE_ACCOUNT = "__any__";

const EMPTY: AgentDraft = {
  name: "",
  description: "",
  netsuiteAccountId: null,
  personaId: AVA_PERSONA_ID,
  method: "key",
  issueClientCredentials: false,
  callbackUrl: KNOWN_CALLBACK_URLS[0].url,
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

  // Reopening must not show the last app's details, and an edit starts from
  // what the app currently holds rather than whatever was typed last.
  useEffect(() => {
    if (open) {
      setDraft(initial ?? EMPTY);
    }
  }, [open, initial]);

  const creating = mode === "create";
  const trimmed = draft.name.trim();
  const needsCallback =
    creating && draft.method === "signin" && draft.issueClientCredentials;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {creating ? "New agent app" : "Edit agent app"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1 sm:grid-cols-2">
          <Field htmlFor="agent-name" label="Name">
            <Input
              autoFocus
              id="agent-name"
              maxLength={128}
              onChange={(event) =>
                setDraft((d) => ({ ...d, name: event.target.value }))
              }
              placeholder="AP review agent"
              value={draft.name}
            />
          </Field>

          <Field htmlFor="agent-description" label="Note">
            <Input
              id="agent-description"
              maxLength={256}
              onChange={(event) =>
                setDraft((d) => ({ ...d, description: event.target.value }))
              }
              placeholder="My personal Claude account"
              value={draft.description}
            />
          </Field>

          <Field htmlFor="agent-persona" label="Persona">
            <Select
              onValueChange={(personaId) =>
                setDraft((d) => ({ ...d, personaId }))
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
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {accounts.length > 0 ? (
            <Field htmlFor="agent-account" label="NetSuite account">
              <Select
                onValueChange={(value) =>
                  setDraft((d) => ({
                    ...d,
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {creating ? (
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs">Connects by</Label>
              <RadioGroup
                className="grid-cols-2"
                onValueChange={(value) =>
                  setDraft((d) => ({
                    ...d,
                    method: value as AgentConnectionMethod,
                  }))
                }
                value={draft.method}
              >
                <MethodOption label={METHOD_NAMES.agentKey} value="key" />
                <MethodOption label={METHOD_NAMES.signIn} value="signin" />
              </RadioGroup>
            </div>
          ) : null}

          {creating && draft.method === "signin" ? (
            <div className="space-y-2 sm:col-span-2">
              <label
                className="flex cursor-pointer items-center gap-2.5 text-xs"
                htmlFor="agent-client-credentials"
              >
                <Checkbox
                  checked={draft.issueClientCredentials}
                  id="agent-client-credentials"
                  onCheckedChange={(checked) =>
                    setDraft((d) => ({
                      ...d,
                      issueClientCredentials: checked === true,
                    }))
                  }
                />
                Connector needs a client ID and secret
              </label>

              {draft.issueClientCredentials ? (
                <div className="flex items-center gap-2">
                  <Input
                    className="font-mono text-xs"
                    onChange={(event) =>
                      setDraft((d) => ({
                        ...d,
                        callbackUrl: event.target.value,
                      }))
                    }
                    placeholder="Callback URL"
                    value={draft.callbackUrl}
                  />
                  {KNOWN_CALLBACK_URLS.map((entry) => (
                    <Button
                      className="shrink-0"
                      key={entry.url}
                      onClick={() =>
                        setDraft((d) => ({ ...d, callbackUrl: entry.url }))
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {entry.label}
                    </Button>
                  ))}
                </div>
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
            disabled={
              !trimmed || saving || (needsCallback && !draft.callbackUrl.trim())
            }
            onClick={() =>
              onSubmit({
                ...draft,
                name: trimmed,
                description: draft.description.trim(),
              })
            }
            type="button"
          >
            {saving ? "Saving…" : creating ? "Create app" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function MethodOption({
  value,
  label,
}: {
  value: AgentConnectionMethod;
  label: string;
}) {
  return (
    <Label
      className="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm has-[:checked]:border-primary/60 has-[:checked]:bg-muted/50"
      htmlFor={`agent-method-${value}`}
    >
      <RadioGroupItem id={`agent-method-${value}`} value={value} />
      {label}
    </Label>
  );
}
