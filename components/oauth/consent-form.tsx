"use client";

import { AlertTriangle } from "lucide-react";
import { useActionState, useState } from "react";
import {
  type ConsentState,
  submitConsent,
} from "@/app/oauth/authorize/actions";
import type { AgentPersonaOption } from "@/components/agent-key-dialog";
import { Button } from "@/components/ui/button";
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

export type ConsentAccountOption = {
  accountId: string;
  label: string;
  connected: boolean;
};

export type ConsentFormProps = {
  /** The OAuth parameters, replayed verbatim so the action re-validates them. */
  params: Record<string, string>;
  clientName: string;
  redirectHost: string;
  loopbackOnly: boolean;
  userEmail: string | null;
  personas: AgentPersonaOption[];
  accounts: ConsentAccountOption[];
};

/**
 * Radix refuses an empty `value` on a Select item, so "follow my active
 * account" needs a sentinel. The action maps it back to null.
 */
const FOLLOW_ACTIVE_ACCOUNT = "__any__";

export function ConsentForm({
  params,
  clientName,
  redirectHost,
  loopbackOnly,
  userEmail,
  personas,
  accounts,
}: ConsentFormProps) {
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(
    submitConsent,
    null,
  );
  const [name, setName] = useState(clientName);
  const [personaId, setPersonaId] = useState(AVA_PERSONA_ID);
  const [accountId, setAccountId] = useState(FOLLOW_ACTIVE_ACCOUNT);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {Object.entries(params).map(([key, value]) => (
        <input key={key} name={key} type="hidden" value={value} />
      ))}

      <div className="space-y-2 text-center">
        <h1 className="font-medium text-lg">
          {clientName} wants to work in your NetSuite workspace
        </h1>
        <p className="text-muted-foreground text-sm">
          It will act as {userEmail ?? "you"}, reaching exactly the NetSuite
          tools you have enabled — nothing more.
        </p>
      </div>

      <p className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
        You will be sent back to{" "}
        <span className="font-mono">{redirectHost}</span>.
      </p>

      {loopbackOnly ? (
        <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            This agent runs on your own computer, so it is identified only by
            the port it is listening on. Approve it if you just started a
            sign-in yourself; close this page if you did not.
          </span>
        </p>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="consent-name">
            Name this agent
          </Label>
          <Input
            id="consent-name"
            maxLength={128}
            name="agent_name"
            onChange={(event) => setName(event.target.value)}
            placeholder={clientName}
            value={name}
          />
          <p className="text-muted-foreground text-xs">
            What it is called under App Portal → Agent access.
          </p>
        </div>

        {accounts.length > 0 ? (
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="consent-account">
              NetSuite account
            </Label>
            <Select
              name="netsuite_account_id"
              onValueChange={setAccountId}
              value={accountId}
            >
              <SelectTrigger className="w-full text-sm" id="consent-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLLOW_ACTIVE_ACCOUNT}>
                  Any — follow my active account
                </SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.accountId} value={account.accountId}>
                    {account.label}
                    {account.connected ? "" : " · not connected"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Pinning an account means changing your active one cannot redirect
              this agent at another subsidiary.
            </p>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="consent-persona">
            Acts as
          </Label>
          <Select
            name="persona_id"
            onValueChange={setPersonaId}
            value={personaId}
          >
            <SelectTrigger className="w-full text-sm" id="consent-persona">
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

      {state?.error ? (
        <p className="text-destructive text-sm">{state.error}</p>
      ) : null}

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={pending}
          name="intent"
          type="submit"
          value="deny"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={pending || !name.trim()}
          name="intent"
          type="submit"
          value="approve"
        >
          {pending ? "Working…" : "Authorize"}
        </Button>
      </div>
    </form>
  );
}
