"use client";

import { AlertTriangle, CheckCircle2, Copy, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildConnectClients,
  type ConnectClientId,
  type ConnectMethod,
  PREREQUISITE,
} from "@/lib/mcp/connect-clients";
import type { ConnectPreflight } from "@/lib/mcp/server/oauth/preflight";

/**
 * "I have this AI, how do I connect it?"
 *
 * Every client wants the same server URL in a different shape, and getting the
 * shape wrong fails quietly. Rather than describing the differences, this hands
 * over the exact thing to paste.
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
  const signInAvailable = preflight.status === "ready";

  return (
    <div className="space-y-5">
      <PreflightBanner preflight={preflight} />

      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="connect-client">
          Which AI are you connecting?
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

      {client.runsOn === "vendor" ? (
        <p className="flex gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-muted-foreground text-xs leading-relaxed">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {client.label} runs on its vendor's servers, so it needs this
            install to be reachable on the internet.
          </span>
        </p>
      ) : null}

      {client.signIn ? (
        <MethodBlock
          badge={signInAvailable ? "Recommended" : "Unavailable here"}
          dimmed={!signInAvailable}
          method={client.signIn}
          prerequisite={PREREQUISITE.signIn}
        />
      ) : null}

      <MethodBlock
        badge={signInAvailable ? "Or use a key" : "Use this"}
        method={client.agentKey}
        prerequisite={PREREQUISITE.agentKey}
      />
    </div>
  );
}

function PreflightBanner({ preflight }: { preflight: ConnectPreflight }) {
  const ready = preflight.status === "ready";
  const Icon = ready ? CheckCircle2 : AlertTriangle;

  return (
    <p
      className={
        ready
          ? "flex gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-muted-foreground text-xs leading-relaxed"
          : "flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs leading-relaxed dark:text-amber-400"
      }
    >
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-medium">{preflight.title}.</span>{" "}
        {preflight.detail}
      </span>
    </p>
  );
}

function MethodBlock({
  method,
  badge,
  dimmed,
  prerequisite,
}: {
  method: ConnectMethod;
  badge: string;
  dimmed?: boolean;
  /** Rendered as step one; the agent exists before any client is touched. */
  prerequisite: string;
}) {
  return (
    <section className={dimmed ? "space-y-2 opacity-60" : "space-y-2"}>
      <div className="flex items-center gap-2">
        <Label className="text-xs">{method.heading}</Label>
        <Badge variant="secondary">{badge}</Badge>
      </div>

      <ol className="ml-4 list-decimal space-y-1 text-muted-foreground text-xs leading-relaxed">
        <li className="text-foreground/80">{prerequisite}</li>
        {method.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {method.snippet ? <Snippet snippet={method.snippet} /> : null}

      {method.note ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {method.note}
        </p>
      ) : null}
    </section>
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
