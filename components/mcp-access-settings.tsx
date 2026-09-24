"use client";

import { Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AgentKeyDialog,
  type AgentKeyDraft,
  type AgentPersonaOption,
} from "@/components/agent-key-dialog";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";
import { fetcher } from "@/lib/utils";
import { toast } from "./toast";

type McpKeySummary = {
  id: string;
  name: string;
  maskedToken: string;
  copyable: boolean;
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
  personas: AgentPersonaOption[];
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
  personas: AgentPersonaOption[],
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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
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
  const [saving, setSaving] = useState(false);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [editing, setEditing] = useState<McpKeySummary | null>(null);
  const [pendingRotate, setPendingRotate] = useState<McpKeySummary | null>(
    null,
  );

  const copy = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ type: "success", description: `${label} copied.` });
    } catch {
      toast({ type: "error", description: `Could not copy the ${label}.` });
    }
  }, []);

  const copyKey = useCallback(
    async (key: McpKeySummary) => {
      if (!key.copyable) {
        toast({
          type: "error",
          description:
            "This key predates copiable keys. Use Replace to get one you can copy.",
        });
        return;
      }
      try {
        const response = await fetch(`${ENDPOINT}/${key.id}/reveal`);
        const payload = await response.json();
        if (!response.ok) {
          toast({
            type: "error",
            description: payload.error ?? "Could not copy the key.",
          });
          return;
        }
        await copy(payload.token, "Agent key");
      } catch {
        toast({ type: "error", description: "Could not copy the key." });
      }
    },
    [copy],
  );

  const createKey = useCallback(
    async (draft: AgentKeyDraft) => {
      setSaving(true);
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const payload = await response.json();
        if (!response.ok) {
          toast({
            type: "error",
            description: payload.error ?? "Could not create the agent.",
          });
          return;
        }

        setCreatingOpen(false);
        await mutate();
        await onChanged?.();
        await copy(payload.token, "Agent key");
        toast({
          type: "success",
          description: `${draft.name} created. Its key is on your clipboard.`,
        });
      } catch {
        toast({ type: "error", description: "Could not create the agent." });
      } finally {
        setSaving(false);
      }
    },
    [copy, mutate, onChanged],
  );

  const saveKey = useCallback(
    async (keyId: string, draft: AgentKeyDraft) => {
      setSaving(true);
      try {
        const response = await fetch(`${ENDPOINT}/${keyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const payload = await response.json();
        if (!response.ok) {
          toast({
            type: "error",
            description: payload.error ?? "Could not save the agent.",
          });
          return;
        }

        setEditing(null);
        await mutate();
        toast({ type: "success", description: `${draft.name} saved.` });
      } catch {
        toast({ type: "error", description: "Could not save the agent." });
      } finally {
        setSaving(false);
      }
    },
    [mutate],
  );

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
        await mutate();
        await copy(payload.token, "Agent key");
        toast({
          type: "success",
          description: `New key for ${key.name} copied to your clipboard.`,
        });
      } catch {
        toast({ type: "error", description: "Could not replace the key." });
      }
    },
    [copy, mutate],
  );

  const revokeKey = useCallback(
    async (keyId: string) => {
      const response = await fetch(`${ENDPOINT}/${keyId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await mutate();
        await onChanged?.();
        toast({ type: "success", description: "Agent revoked." });
      } else {
        toast({ type: "error", description: "Could not revoke the agent." });
      }
    },
    [mutate, onChanged],
  );

  const editingDraft = useMemo<AgentKeyDraft | undefined>(
    () =>
      editing
        ? {
            name: editing.name,
            personaId: editing.personaId ?? AVA_PERSONA_ID,
          }
        : undefined,
    [editing],
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
          An agent acts as you over MCP, reaching exactly what you have enabled
          in OpenSuiteMCP — nothing more.
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
            This install's public address. Every agent here connects through it.
          </p>
        </section>

        {blocked ? (
          <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-muted-foreground text-xs leading-relaxed">
            {blockedReason(data)}
          </p>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs">Your agents</Label>
            <Button
              disabled={blocked || atLimit}
              onClick={() => setCreatingOpen(true)}
              size="sm"
              type="button"
            >
              <Plus className="size-3.5" />
              New agent
            </Button>
          </div>

          {atLimit ? (
            <p className="text-muted-foreground text-xs">
              You have reached the limit of {data.policy.maxKeysPerUser} active
              agents. Revoke one to create another.
            </p>
          ) : null}

          {data.keys.length === 0 ? (
            <p className="text-muted-foreground text-xs">No agents yet.</p>
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
                      <Badge variant="secondary">
                        {personaLabel(key.personaId, personas)}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {key.lastUsedAt
                          ? `Last used ${formatDate(key.lastUsedAt)}`
                          : "Never used"}
                      </span>
                      {key.rotatedAt ? (
                        <span className="text-muted-foreground text-xs">
                          {`Key replaced ${formatDate(key.rotatedAt)}`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {key.status === "active" ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        onClick={() => copyKey(key)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Copy className="size-3.5" />
                        <span className="sr-only">
                          Copy the key for {key.name}
                        </span>
                      </Button>
                      <Button
                        onClick={() => setEditing(key)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Pencil className="size-3.5" />
                        <span className="sr-only">Edit {key.name}</span>
                      </Button>
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

      <AgentKeyDialog
        mode="create"
        onOpenChange={setCreatingOpen}
        onSubmit={createKey}
        open={creatingOpen}
        personas={personas}
        saving={saving}
      />

      <AgentKeyDialog
        initial={editingDraft}
        mode="edit"
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSubmit={(draft) => {
          if (editing) {
            void saveKey(editing.id, draft);
          }
        }}
        open={Boolean(editing)}
        personas={personas}
        saving={saving}
      />

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
