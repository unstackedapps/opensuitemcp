"use client";

import { Copy, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { Badge } from "@/components/ui/badge";
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
import { fetcher } from "@/lib/utils";
import { toast } from "./toast";

type McpKeySummary = {
  id: string;
  name: string;
  maskedToken: string;
  netsuiteAccountId: string | null;
  personaId: string | null;
  lastUsedAt: string | null;
  rotatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  status: "active" | "revoked" | "expired";
};

type McpKeysResponse = {
  serverUrl: string;
  policy: {
    enabled: boolean;
    memberAccess: "all" | "selected";
    memberAllowed: boolean;
    maxKeysPerUser: number;
    managedByOrg: boolean;
  };
  keys: McpKeySummary[];
  personas: PersonaOption[];
};

type PersonaOption = {
  id: string;
  name: string;
  primaryRole: string;
  authoredBy: "agent" | "user";
};

const ENDPOINT = "/api/settings/mcp-keys";

function blockedReason(data: McpKeysResponse): string {
  if (!data.policy.enabled) {
    return "Agent access is turned off for your organization. Ask an administrator to enable it.";
  }
  return "Agent access is limited to selected members of your organization. Ask an administrator to add you.";
}

/**
 * The persona a key acts as.
 *
 * Every key has one. A key minted before personas existed, and a key whose
 * persona was deleted afterwards, both fall back to Ava — she ships with the
 * install and cannot be removed, so no key is ever left holding a role that
 * does not exist. Mirrors resolveAssignedPersona on the server.
 */
function personaLabel(
  personaId: string | null,
  personas: PersonaOption[],
): string {
  const match = personaId
    ? personas.find((persona) => persona.id === personaId)
    : undefined;
  if (match) {
    return match.name;
  }
  return (
    personas.find((persona) => persona.id === AVA_PERSONA_ID)?.name ?? "Ava"
  );
}

export function McpAccessPanel({
  active,
  onChanged,
}: {
  active: boolean;
  /** Minting or revoking a key changes onboarding readiness; let the host know. */
  onChanged?: () => Promise<unknown> | undefined;
}) {
  const { data, isLoading, mutate } = useSWR<McpKeysResponse>(
    active ? ENDPOINT : null,
    fetcher,
  );
  const [name, setName] = useState("");
  const [personaId, setPersonaId] = useState<string>(AVA_PERSONA_ID);
  const [creating, setCreating] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [pendingRotate, setPendingRotate] = useState<McpKeySummary | null>(
    null,
  );

  // Drop the one-time token as soon as the panel closes so it does not sit in
  // component state for the rest of the session.
  useEffect(() => {
    if (!active) {
      setIssuedToken(null);
    }
  }, [active]);

  const copy = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ type: "success", description: `${label} copied.` });
    } catch {
      toast({ type: "error", description: `Could not copy the ${label}.` });
    }
  }, []);

  const createKey = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ type: "error", description: "Give the key a name." });
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          personaId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast({
          type: "error",
          description: payload.error ?? "Could not create the key.",
        });
        return;
      }

      setIssuedToken(payload.token);
      setName("");
      setPersonaId(AVA_PERSONA_ID);
      await mutate();
      await onChanged?.();
      toast({ type: "success", description: "Agent key created." });
    } catch {
      toast({ type: "error", description: "Could not create the key." });
    } finally {
      setCreating(false);
    }
  }, [mutate, name, onChanged, personaId]);

  const rotateKey = useCallback(
    async (key: McpKeySummary) => {
      try {
        const response = await fetch(`${ENDPOINT}/${key.id}/rotate`, {
          method: "POST",
        });
        const payload = await response.json();
        if (!response.ok) {
          toast({
            type: "error",
            description: payload.error ?? "Could not replace the key.",
          });
          return;
        }
        setIssuedToken(payload.token);
        await mutate();
        toast({
          type: "success",
          description: `New key issued for ${key.name}.`,
        });
      } catch {
        toast({ type: "error", description: "Could not replace the key." });
      }
    },
    [mutate],
  );

  const revokeKey = useCallback(
    async (keyId: string) => {
      const response = await fetch(`${ENDPOINT}/${keyId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await mutate();
        await onChanged?.();
        toast({ type: "success", description: "Agent key revoked." });
      } else {
        toast({ type: "error", description: "Could not revoke the key." });
      }
    },
    [mutate, onChanged],
  );

  if (isLoading || !data) {
    return (
      <div className="p-4 text-muted-foreground text-sm sm:p-5">Loading…</div>
    );
  }

  const personas = data.personas ?? [];
  const activeKeys = data.keys.filter((key) => key.status === "active");
  const atLimit = activeKeys.length >= data.policy.maxKeysPerUser;
  const blocked = !(data.policy.enabled && data.policy.memberAllowed);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 space-y-1 border-border/60 border-b px-4 py-3 sm:px-5">
        <p className="flex items-center gap-1.5 font-medium text-sm">
          <KeyRound className="size-3.5 text-muted-foreground" />
          Agent access
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Let an external AI agent act as you over MCP. It reaches exactly what
          you have enabled in OpenSuiteMCP — nothing more.
        </p>
      </div>

      <div className="space-y-6 p-4 sm:p-5">
        <section className="space-y-2">
          <Label className="text-xs">Server URL</Label>
          <div className="flex items-center gap-2">
            <Input
              className="font-mono text-xs"
              readOnly
              value={data.serverUrl}
            />
            <Button
              onClick={() => copy(data.serverUrl, "Server URL")}
              size="sm"
              type="button"
              variant="outline"
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Give this URL and a key to the agent. It derives from this install's
            public address, so self-hosted and hosted installs each have their
            own.
          </p>
        </section>

        {blocked ? (
          <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-muted-foreground text-xs leading-relaxed">
            {blockedReason(data)}
          </p>
        ) : null}

        {issuedToken ? (
          <section className="space-y-2 rounded-md border border-border/60 bg-muted/40 p-3">
            <p className="font-medium text-xs">
              Copy this key now — it is shown once and cannot be retrieved
              again.
            </p>
            <div className="flex items-center gap-2">
              <Input
                className="font-mono text-xs"
                readOnly
                value={issuedToken}
              />
              <Button
                onClick={() => copy(issuedToken, "Agent key")}
                size="sm"
                type="button"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
            <Button
              onClick={() => setIssuedToken(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Done
            </Button>
          </section>
        ) : null}

        <section className="space-y-3">
          <Label className="text-xs" htmlFor="mcp-key-name">
            New key
          </Label>
          <Input
            disabled={blocked || atLimit}
            id="mcp-key-name"
            maxLength={128}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. AP review agent"
            value={name}
          />
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="mcp-key-persona">
              Persona
            </Label>
            <Select
              disabled={blocked || atLimit}
              onValueChange={setPersonaId}
              value={personaId}
            >
              <SelectTrigger
                aria-label="Persona for this agent key"
                className="h-9 w-full text-xs"
                id="mcp-key-persona"
              >
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
            <p className="text-muted-foreground text-xs leading-relaxed">
              The specialist this agent is meant to be. It reads the persona on
              connect and works that way. The agent can change or shed it later,
              and write new ones of its own.
            </p>
          </div>
          <Button
            disabled={blocked || atLimit || creating}
            onClick={createKey}
            size="sm"
            type="button"
          >
            <Plus className="size-3.5" />
            {creating ? "Creating…" : "Create key"}
          </Button>
          {atLimit ? (
            <p className="text-muted-foreground text-xs">
              You have reached the limit of {data.policy.maxKeysPerUser} active
              keys. Revoke one to create another.
            </p>
          ) : null}
        </section>

        <section className="space-y-2">
          <Label className="text-xs">Your keys</Label>
          {data.keys.length === 0 ? (
            <p className="text-muted-foreground text-xs">No keys yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.keys.map((key) => (
                <li
                  className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3"
                  key={key.id}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium text-sm">{key.name}</p>
                    <p className="truncate font-mono text-muted-foreground text-xs">
                      {key.maskedToken}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {key.status !== "active" ? (
                        <Badge variant="outline">{key.status}</Badge>
                      ) : null}
                      <span className="text-muted-foreground text-xs">
                        {key.lastUsedAt
                          ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                          : "Never used"}
                      </span>
                      {key.rotatedAt ? (
                        <span className="text-muted-foreground text-xs">
                          {`Key replaced ${new Date(key.rotatedAt).toLocaleDateString()}`}
                        </span>
                      ) : null}
                      <Badge variant="secondary">
                        {personaLabel(key.personaId, personas)}
                      </Badge>
                    </div>
                  </div>
                  {key.status === "active" ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        onClick={() => setPendingRotate(key)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <RefreshCw className="size-3.5" />
                        <span className="sr-only">
                          Replace the key for {key.name}
                        </span>
                      </Button>
                      <Button
                        onClick={() => revokeKey(key.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">Revoke {key.name}</span>
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <ConfirmDestructiveDialog
        confirmLabel="Replace key"
        description={
          pendingRotate
            ? `${pendingRotate.name} keeps its name, persona and settings, but its current key stops working immediately. Anything already using that key must be given the new one.`
            : ""
        }
        onConfirm={() => {
          if (pendingRotate) {
            void rotateKey(pendingRotate);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRotate(null);
          }
        }}
        open={Boolean(pendingRotate)}
        title="Replace this agent's key?"
      />
    </div>
  );
}
