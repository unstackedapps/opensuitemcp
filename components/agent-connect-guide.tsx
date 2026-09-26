"use client";

import { ChevronDown, Copy, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildConnectClients,
  type ConnectClientId,
  type ConnectMethod,
  VENDOR_REACHABILITY_NOTE,
} from "@/lib/mcp/connect-clients";
import type { ConnectPreflight } from "@/lib/mcp/server/oauth/preflight";

/**
 * "I have this AI, how do I connect it?"
 *
 * Short on purpose. Whoever is reading this is standing in the panel that
 * creates agents, so the shared first step — go to Agent access and make one —
 * is the one instruction they demonstrably do not need; the public guide keeps
 * it because its reader is somewhere else. One method is shown at a time, and
 * the caveats sit behind a disclosure, because a caveat rendered as step 2 is
 * how this grew to a screenful for what is really: pick a client, copy this.
 */
export function AgentConnectGuide({
  serverUrl,
  preflight,
}: {
  serverUrl: string;
  preflight: ConnectPreflight;
}) {
  const clients = useMemo(() => buildConnectClients(serverUrl), [serverUrl]);
  const [selected, setSelected] = useState<ConnectClientId>("claude");
  const client = clients.find((entry) => entry.id === selected) ?? clients[0];
  // An install without HTTPS or without AUTH_URL cannot complete a sign-in, so
  // it is not offered — the panel header already says why.
  const signInAvailable = preflight.status === "ready";
  const [method, setMethod] = useState<"signIn" | "agentKey">("signIn");
  const canSignIn = signInAvailable && Boolean(client.signIn);
  const showing = canSignIn ? method : "agentKey";

  const active =
    showing === "signIn" && client.signIn ? client.signIn : client.agentKey;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label className="text-xs" htmlFor="connect-client">
            Which AI?
          </Label>
          <Select
            onValueChange={(value) => setSelected(value as ConnectClientId)}
            value={selected}
          >
            <SelectTrigger className="w-full text-sm" id="connect-client">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clients.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs
          onValueChange={(value) => setMethod(value as "signIn" | "agentKey")}
          value={showing}
        >
          <TabsList>
            <TabsTrigger disabled={!canSignIn} value="signIn">
              Sign-in
            </TabsTrigger>
            <TabsTrigger value="agentKey">Agent key</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Steps method={active} />

      {client.runsOn === "vendor" ? (
        <p className="flex gap-2 text-muted-foreground text-xs leading-relaxed">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {VENDOR_REACHABILITY_NOTE}
        </p>
      ) : null}
    </div>
  );
}

function Steps({ method }: { method: ConnectMethod }) {
  return (
    <div className="space-y-2">
      <ol className="ml-4 list-decimal space-y-1 text-muted-foreground text-xs leading-relaxed">
        {method.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {method.snippet ? <Snippet snippet={method.snippet} /> : null}

      {method.note ? (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
            <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
            Good to know
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1.5 text-muted-foreground text-xs leading-relaxed">
            {method.note}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function Snippet({
  snippet,
}: {
  snippet: NonNullable<ConnectMethod["snippet"]>;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      toast({ type: "success", description: "Copied." });
    } catch {
      toast({ type: "error", description: "Could not copy that." });
    }
  };

  return (
    <div className="space-y-1">
      {snippet.location ? (
        <p className="font-mono text-muted-foreground text-[11px]">
          {snippet.location}
        </p>
      ) : null}
      <div className="relative">
        <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-3 pr-11 font-mono text-xs leading-relaxed">
          <code>{snippet.code}</code>
        </pre>
        <Button
          className="absolute top-1.5 right-1.5 size-7 p-0"
          onClick={copy}
          type="button"
          variant="ghost"
        >
          <Copy className="size-3.5" />
          <span className="sr-only">Copy this snippet</span>
        </Button>
      </div>
    </div>
  );
}
