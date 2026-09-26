"use client";

import { AlertTriangle } from "lucide-react";
import { useActionState, useState } from "react";
import {
  type ConsentState,
  submitConsent,
} from "@/app/oauth/authorize/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/** A waiting agent, already named and configured in the portal. */
export type ConsentAgentOption = {
  id: string;
  name: string;
  personaName: string | null;
  accountLabel: string | null;
};

export type ConsentFormProps = {
  /** The OAuth parameters, replayed verbatim so the action re-validates them. */
  params: Record<string, string>;
  clientName: string;
  redirectHost: string;
  loopbackOnly: boolean;
  userEmail: string | null;
  agents: ConsentAgentOption[];
};

/**
 * The consent screen.
 *
 * A yes-or-no question, deliberately. The agent was named, given a persona and
 * pinned to an account in the portal before any of this started, so there is
 * nothing to fill in here — only something to agree to. Anything more would be
 * a second setup form in the middle of somebody else's sign-in.
 *
 * The one input appears when more than one agent is waiting, and it is a
 * choice between existing rows, not a way to make another.
 */
export function ConsentForm({
  params,
  clientName,
  redirectHost,
  loopbackOnly,
  userEmail,
  agents,
}: ConsentFormProps) {
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(
    submitConsent,
    null,
  );
  const [grantId, setGrantId] = useState(agents[0]?.id ?? "");
  const chosen = agents.find((agent) => agent.id === grantId) ?? agents[0];

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {Object.entries(params).map(([key, value]) => (
        <input key={key} name={key} type="hidden" value={value} />
      ))}
      <input name="grant_id" type="hidden" value={grantId} />

      <div className="space-y-2 text-center">
        <h1 className="font-medium text-lg">{clientName} wants to connect</h1>
        <p className="text-muted-foreground text-sm">
          It will act as {userEmail ?? "you"}, reaching exactly the NetSuite
          tools you have enabled — nothing more.
        </p>
      </div>

      {agents.length === 1 ? (
        <dl className="space-y-1.5 rounded-md border bg-muted/40 px-3 py-2.5 text-xs">
          <Row label="Connect as" value={chosen?.name ?? ""} />
          {chosen?.personaName ? (
            <Row label="Persona" value={chosen.personaName} />
          ) : null}
          {chosen?.accountLabel ? (
            <Row label="NetSuite account" value={chosen.accountLabel} />
          ) : null}
          <Row label="Returns to" mono value={redirectHost} />
        </dl>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">Connect as</Label>
          <RadioGroup onValueChange={setGrantId} value={grantId}>
            {agents.map((agent) => (
              <Label
                className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm has-[:checked]:border-primary/60 has-[:checked]:bg-muted/50"
                htmlFor={`agent-${agent.id}`}
                key={agent.id}
              >
                <RadioGroupItem id={`agent-${agent.id}`} value={agent.id} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {agent.name}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {[agent.personaName, agent.accountLabel]
                      .filter(Boolean)
                      .join(" · ") || "No persona assigned"}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <p className="text-muted-foreground text-xs">
            You will be sent back to{" "}
            <span className="font-mono">{redirectHost}</span>.
          </p>
        </div>
      )}

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
          disabled={pending || !grantId}
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

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 truncate ${mono ? "font-mono" : "font-medium"}`}>
        {value}
      </dd>
    </div>
  );
}
