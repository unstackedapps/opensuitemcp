"use client";

import { Copy, Eye, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";
import {
  CALLBACK_PRESETS,
  CONNECTS_FROM_OPTIONS,
  connectsFromLabel,
  METHOD_NAMES,
} from "@/lib/mcp/connect-clients";

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
  /**
   * Which AI product this app is for: a CONNECTS_FROM_OPTIONS id, or free text
   * for anything else. Empty means it was not said.
   */
  connectsFrom: string;
};

/** What an existing app holds, for the half of the dialog it can fill. */
export type AgentAppState = {
  kind: "key" | "grant";
  connectionLabel: string;
  /** Set once at creation; the dialog shows it read-only afterwards. */
  connectsFrom: string | null;
  hasClientCredentials: boolean;
  /** Masked token, or how it signed in. */
  credential: string;
  copyable: boolean;
};

export type AgentCredentials = {
  clientId: string;
  clientSecret: string | null;
  redirectUris: string[];
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
  /** Edit mode: everything the app already has. */
  app?: AgentAppState | null;
  credentials?: AgentCredentials | null;
  busy?: boolean;
  onCopy?: (value: string, what: string) => void;
  onCopyKey?: () => void;
  onReplaceKey?: () => void;
  onRevealCredentials?: () => void;
  onRotateSecret?: () => void;
  onRevoke?: () => void;
};

/**
 * One app, one dialog.
 *
 * What it is called, what it acts as and what it connects with are all facts
 * about the same thing, so splitting them across an edit dialog and a
 * credentials dialog made a person open two windows to answer one question.
 * Two columns and no descriptions: the people using this configure NetSuite
 * for a living, and "Bearer auth" is already their word.
 */

/** Radix refuses an empty `value`, so "follow my active account" needs one. */
const FOLLOW_ACTIVE_ACCOUNT = "__any__";
const MASK = "••••••••••••";

const EMPTY: AgentDraft = {
  name: "",
  description: "",
  netsuiteAccountId: null,
  personaId: AVA_PERSONA_ID,
  method: "key",
  issueClientCredentials: false,
  callbackUrl: CALLBACK_PRESETS[0].url,
  connectsFrom: "",
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
  app,
  credentials,
  busy,
  onCopy,
  onCopyKey,
  onReplaceKey,
  onRevealCredentials,
  onRotateSecret,
  onRevoke,
}: AgentDialogProps) {
  const [draft, setDraft] = useState<AgentDraft>(initial ?? EMPTY);

  // Reopening must not show the last app's details, and an edit starts from
  // what the app currently holds rather than whatever was typed last.
  useEffect(() => {
    if (open) {
      setDraft(initial ?? EMPTY);
    }
  }, [open, initial]);

  // Revealing fills the callback in; the footer Save writes it back with
  // everything else, so the field needs no button of its own.
  useEffect(() => {
    if (credentials) {
      setDraft((d) => ({
        ...d,
        callbackUrl: credentials.redirectUris?.[0] ?? "",
      }));
    }
  }, [credentials]);

  const creating = mode === "create";
  // Set once. A saved app belongs to the product it was made for; one made
  // before this field existed can still be labelled.
  const lockedClient = Boolean(app?.connectsFrom);
  const trimmed = draft.name.trim();
  const needsCallback =
    creating && draft.method === "signin" && draft.issueClientCredentials;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {creating ? "New agent app" : trimmed || "Agent app"}
            {app ? (
              <Badge variant="outline">{app.connectionLabel}</Badge>
            ) : null}
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

          <Field htmlFor="agent-client" label="Connects from">
            {lockedClient ? (
              <Input
                id="agent-client"
                readOnly
                value={connectsFromLabel(draft.connectsFrom)}
              />
            ) : (
              <Select
                onValueChange={(value) =>
                  setDraft((d) => ({ ...d, connectsFrom: value }))
                }
                value={draft.connectsFrom}
              >
                <SelectTrigger className="w-full text-sm" id="agent-client">
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {CONNECTS_FROM_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          {/* Without a NetSuite account field there is an odd number of
              half-width fields, and the last one leaves a hole. */}
          <Field
            htmlFor="agent-persona"
            label="Persona"
            wide={accounts.length === 0}
          >
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

          <Field htmlFor="agent-description" label="Note" wide>
            <Textarea
              className="min-h-16 resize-none"
              id="agent-description"
              maxLength={256}
              onChange={(event) =>
                setDraft((d) => ({ ...d, description: event.target.value }))
              }
              rows={2}
              value={draft.description}
            />
          </Field>

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
                  {CALLBACK_PRESETS.map((entry) => (
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
                  <Button
                    className="shrink-0"
                    onClick={() => setDraft((d) => ({ ...d, callbackUrl: "" }))}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Custom
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {app ? (
            <div className="space-y-3 border-border/60 border-t pt-3 sm:col-span-2">
              {app.hasClientCredentials ? (
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Credentials</Label>
                  <div className="flex gap-2">
                    <Button
                      disabled={busy}
                      onClick={onRevealCredentials}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Eye className="size-3.5" />
                      Reveal
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={onRotateSecret}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RefreshCw className="size-3.5" />
                      New secret
                    </Button>
                  </div>
                </div>
              ) : null}

              {app.kind === "key" ? (
                <Row
                  action={
                    <Button
                      onClick={onReplaceKey}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RefreshCw className="size-3.5" />
                      Replace
                    </Button>
                  }
                  label="Token"
                  onCopy={app.copyable ? onCopyKey : undefined}
                  value={app.credential}
                />
              ) : null}

              {app.hasClientCredentials ? (
                <>
                  <Row
                    label="Client ID"
                    onCopy={
                      credentials
                        ? () => onCopy?.(credentials.clientId, "Client ID")
                        : undefined
                    }
                    value={credentials?.clientId ?? MASK}
                  />
                  <Row
                    label="Client secret"
                    onCopy={
                      credentials?.clientSecret
                        ? () =>
                            onCopy?.(
                              credentials.clientSecret ?? "",
                              "Client secret",
                            )
                        : undefined
                    }
                    value={credentials?.clientSecret ?? MASK}
                  />
                  {credentials ? (
                    <Row
                      editable
                      label="Callback URL"
                      onChange={(value) =>
                        setDraft((d) => ({ ...d, callbackUrl: value }))
                      }
                      value={draft.callbackUrl}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          {app ? (
            <Button
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onRevoke}
              type="button"
              variant="outline"
            >
              Revoke
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                !trimmed ||
                saving ||
                (needsCallback && !draft.callbackUrl.trim())
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
  wide,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  /** Spans both columns: for a control taller than one row. */
  wide?: boolean;
}) {
  return (
    <div className={`space-y-1.5${wide ? " sm:col-span-2" : ""}`}>
      <Label className="text-xs" htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  onCopy,
  onChange,
  editable,
  action,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  onChange?: (value: string) => void;
  editable?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-28 shrink-0 text-muted-foreground text-xs">
        {label}
      </Label>
      <Input
        className="font-mono text-xs"
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={!editable}
        value={value}
      />
      {onCopy ? (
        <Button
          className="size-9 shrink-0 p-0"
          onClick={onCopy}
          type="button"
          variant="outline"
        >
          <Copy className="size-3.5" />
          <span className="sr-only">Copy the {label}</span>
        </Button>
      ) : null}
      {action}
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
