"use client";

import { AlertTriangle } from "lucide-react";
import { useActionState, useState } from "react";
import {
  type ConsentState,
  submitConsent,
} from "@/app/oauth/authorize/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { connectsFromLabel } from "@/lib/mcp/connect-clients";

/** A waiting agent, already named and configured in the portal. */
function agentDetail(agent: {
  connectsFrom: string | null;
  personaName: string | null;
  accountLabel: string | null;
}): string {
  return [
    connectsFromLabel(agent.connectsFrom),
    agent.personaName,
    agent.accountLabel,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
}

export type ConsentAgentOption = {
  id: string;
  name: string;
  personaName: string | null;
  accountLabel: string | null;
  /** Which AI product it was created for, shown so two apps are tellable apart. */
  connectsFrom: string | null;
  /** True when that matches the client now asking, so it is pre-selected. */
  matchesClient: boolean;
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
  // Pre-selecting the first app meant a client that registered itself bound to
  // whichever app happened to be waiting, because Authorize was already armed.
  // With one app there is nothing to choose; with more, choose.
  const [grantId, setGrantId] = useState(
    agents.length === 1
      ? (agents[0]?.id ?? "")
      : // Exactly one app created for the product now asking is a safe
        // pre-selection. Two would be a guess, so neither is chosen.
        agents.filter((agent) => agent.matchesClient).length === 1
        ? (agents.find((agent) => agent.matchesClient)?.id ?? "")
        : "",
  );
  const chosen = agents.find((agent) => agent.id === grantId);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {Object.entries(params).map(([key, value]) => (
        <input key={key} name={key} type="hidden" value={value} />
      ))}
      <input name="grant_id" type="hidden" value={grantId} />

      <div className="space-y-2 text-center">
        <h1 className="font-medium text-lg">{clientName} wants to connect</h1>
        <p className="text-muted-foreground text-sm">
          It will act as {userEmail ?? "you"}, reaching the NetSuite tools you
          have enabled.
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
          <Label className="text-xs" htmlFor="consent-agent">
            Connect as
          </Label>
          {/* A list, not a stack of cards: an org can have a great many apps
              waiting, and a radio each turns the screen into a scroll. */}
          <Select onValueChange={setGrantId} value={grantId}>
            <SelectTrigger className="w-full text-sm" id="consent-agent">
              <SelectValue placeholder="Choose an agent app" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                  {agentDetail(agent) ? (
                    <span className="text-muted-foreground">
                      {" · "}
                      {agentDetail(agent)}
                    </span>
                  ) : null}
                  {agent.matchesClient ? (
                    <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                      Match
                    </span>
                  ) : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            the port it is listening on. Authorize it if you just started a
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
