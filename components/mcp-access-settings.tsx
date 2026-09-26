"use client";

import {
  AlertTriangle,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  type AgentAccountOption,
  AgentDialog,
  type AgentDraft,
  type AgentPersonaOption,
} from "@/components/agent-dialog";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { OAuthClientsPanel } from "@/components/oauth-clients-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";
import { CONNECT_AGENT_DOCS_URL } from "@/lib/constants";
import type { ConnectPreflight } from "@/lib/mcp/server/oauth/preflight";
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

/**
 * An agent that signed in rather than being handed a key.
 *
 * Deliberately shaped like McpKeySummary: the two are the same thing to whoever
 * owns them, and the list renders them together.
 */
type McpGrantSummary = {
  id: string;
  name: string;
  clientName: string;
  clientUri: string | null;
  personaId: string | null;
  netsuiteAccountId: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  connectedAt: string | null;
  createdAt: string;
  status: "pending" | "active" | "revoked";
};

type McpKeysResponse = {
  serverUrl: string;
  connect: {
    origin: string;
    preflight: ConnectPreflight;
  };
  policy: {
    enabled: boolean;
    memberAccess: "all" | "selected";
    memberAllowed: boolean;
    maxKeysPerUser: number;
    managedByOrg: boolean;
  };
  keys: McpKeySummary[];
  grants: McpGrantSummary[];
  accounts: AgentAccountOption[];
  personas: AgentPersonaOption[];
};

/**
 * One row in the agent list, whichever credential is behind it.
 *
 * A key can be copied and replaced; a signed-in agent cannot, because its
 * client holds a token it refreshes itself. Everything else — the name, the
 * persona, the last use, revoking it — is identical, which is why one list is
 * the honest presentation.
 */
type AgentRow = {
  id: string;
  kind: "key" | "grant";
  name: string;
  credential: string;
  personaId: string | null;
  netsuiteAccountId: string | null;
  lastUsedAt: string | null;
  rotatedAt: string | null;
  status: "pending" | "active" | "revoked" | "expired";
  copyable: boolean;
};

const GRANTS_ENDPOINT = "/api/settings/agent-grants";

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
  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [pendingRotate, setPendingRotate] = useState<AgentRow | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<AgentRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const copy = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ type: "success", description: `${label} copied.` });
    } catch {
      toast({ type: "error", description: `Could not copy the ${label}.` });
    }
  }, []);

  const copyKey = useCallback(
    async (key: AgentRow) => {
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

  /**
   * One dialog, two endpoints.
   *
   * The choice is the agent's, not the caller's: a key has a secret to hand
   * back and a sign-in has nothing until a client arrives, so they cannot share
   * a response shape. Both run the same guards on the server.
   */
  const createAgent = useCallback(
    async (draft: AgentDraft) => {
      const signingIn = draft.method === "signin";
      setSaving(true);
      try {
        const response = await fetch(signingIn ? GRANTS_ENDPOINT : ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            personaId: draft.personaId,
            netsuiteAccountId: draft.netsuiteAccountId,
          }),
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

        if (signingIn) {
          toast({
            type: "success",
            description: `${draft.name} is waiting. Add this server to your AI client and approve it.`,
          });
          return;
        }

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

  const saveAgent = useCallback(
    async (row: AgentRow, draft: AgentDraft) => {
      setSaving(true);
      try {
        const base = row.kind === "grant" ? GRANTS_ENDPOINT : ENDPOINT;
        const response = await fetch(`${base}/${row.id}`, {
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
    async (key: AgentRow) => {
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

  const revokeAgent = useCallback(
    async (row: AgentRow) => {
      const base = row.kind === "grant" ? GRANTS_ENDPOINT : ENDPOINT;
      const response = await fetch(`${base}/${row.id}`, { method: "DELETE" });
      if (response.ok) {
        await mutate();
        await onChanged?.();
        toast({ type: "success", description: `${row.name} archived.` });
      } else {
        toast({ type: "error", description: "Could not archive the agent." });
      }
    },
    [mutate, onChanged],
  );

  const editingDraft = useMemo<AgentDraft | undefined>(
    () =>
      editing
        ? {
            name: editing.name,
            personaId: editing.personaId ?? AVA_PERSONA_ID,
            netsuiteAccountId: editing.netsuiteAccountId,
            // Settled at creation and not offered again, but the dialog's draft
            // is one shape either way.
            method: editing.kind === "grant" ? "signin" : "key",
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
  const accounts = data.accounts ?? [];

  // One list. A key and a sign-in are different handshakes for the same thing,
  // and the person managing them should not have to hold that distinction.
  const rows: AgentRow[] = [
    ...data.keys.map((key) => ({
      id: key.id,
      kind: "key" as const,
      name: key.name,
      credential: key.maskedToken,
      personaId: key.personaId,
      netsuiteAccountId: key.netsuiteAccountId,
      lastUsedAt: key.lastUsedAt,
      rotatedAt: key.rotatedAt,
      status: key.status,
      copyable: key.copyable,
    })),
    ...(data.grants ?? []).map((grant) => ({
      id: grant.id,
      kind: "grant" as const,
      name: grant.name,
      credential: grant.clientName
        ? `Signed in · ${grant.clientName}`
        : "Waiting for a client to sign in",
      personaId: grant.personaId,
      netsuiteAccountId: grant.netsuiteAccountId,
      lastUsedAt: grant.lastUsedAt,
      rotatedAt: null,
      status: grant.status,
      copyable: false,
    })),
  ];

  const activeRows = rows.filter(
    (row) => row.status === "active" || row.status === "pending",
  );
  // Revoked and expired agents are kept — the threads they opened and the work
  // they did still refer to them — but an archive is not a working list.
  const archivedRows = rows.filter(
    (row) => row.status !== "active" && row.status !== "pending",
  );
  const visibleRows = showArchived ? rows : activeRows;
  const atLimit = activeRows.length >= data.policy.maxKeysPerUser;
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

      <div className="space-y-5 p-4 sm:p-5">
        <section className="space-y-2">
          <Label className="text-xs">Server URL</Label>
          <div className="flex items-center gap-2">
            <Input
              className="font-mono text-xs"
              readOnly
              value={data.serverUrl}
            />
            <Button
              className="size-8 shrink-0 p-0 md:size-10"
              onClick={() => copy(data.serverUrl, "Server URL")}
              type="button"
              variant="outline"
            >
              <Copy className="size-3.5" />
              <span className="sr-only">Copy the server URL</span>
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            This install's public address. Every agent here connects through it
            —{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href={CONNECT_AGENT_DOCS_URL}
              rel="noreferrer"
              target="_blank"
            >
              how to connect each AI
            </a>
            .
          </p>
        </section>

        {blocked ? (
          <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-muted-foreground text-xs leading-relaxed">
            {blockedReason(data)}
          </p>
        ) : null}

        {/*
          Only when something is wrong. A misconfigured address breaks sign-in
          for every client at once and explains itself nowhere else — but a
          healthy install does not need telling.
        */}
        {data.connect.preflight.status === "ready" ? null : (
          <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs leading-relaxed dark:text-amber-400">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">
                {data.connect.preflight.title}.
              </span>{" "}
              {data.connect.preflight.detail}
            </span>
          </p>
        )}

        <Tabs defaultValue="agents">
          <TabsList>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="clients">OAuth clients</TabsTrigger>
          </TabsList>

          <TabsContent className="mt-4" value="agents">
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label className="text-xs">Your agents</Label>
                <div className="flex items-center gap-3">
                  {archivedRows.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <Label
                        className="text-muted-foreground text-xs"
                        htmlFor="show-archived-agents"
                      >
                        Show archived
                      </Label>
                      <Switch
                        checked={showArchived}
                        id="show-archived-agents"
                        onCheckedChange={setShowArchived}
                      />
                    </div>
                  ) : null}
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
              </div>

              {atLimit ? (
                <p className="text-muted-foreground text-xs">
                  You have reached the limit of {data.policy.maxKeysPerUser}{" "}
                  active agents. Revoke one to create another.
                </p>
              ) : null}

              {visibleRows.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {activeRows.length === 0
                    ? "No agents yet. Create one, then point your AI client at the server URL above."
                    : "No agents to show."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {visibleRows.map((row) => (
                    <li
                      className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3"
                      key={`${row.kind}-${row.id}`}
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-sm">
                          {row.name}
                        </p>
                        <p className="truncate font-mono text-muted-foreground text-xs">
                          {row.credential}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {row.status === "active" ? null : (
                            <Badge variant="outline">
                              {row.status === "pending"
                                ? "Awaiting connection"
                                : row.status === "expired"
                                  ? "Expired"
                                  : "Archived"}
                            </Badge>
                          )}
                          <Badge variant="secondary">
                            {personaLabel(row.personaId, personas)}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {row.lastUsedAt
                              ? `Last used ${formatDate(row.lastUsedAt)}`
                              : "Never used"}
                          </span>
                          {row.rotatedAt ? (
                            <span className="text-muted-foreground text-xs">
                              {`Key replaced ${formatDate(row.rotatedAt)}`}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {row.status === "active" || row.status === "pending" ? (
                        <div className="flex shrink-0 items-center gap-1">
                          {row.kind === "key" ? (
                            <Button
                              onClick={() => copyKey(row)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              <Copy className="size-3.5" />
                              <span className="sr-only">
                                Copy the key for {row.name}
                              </span>
                            </Button>
                          ) : null}
                          <Button
                            onClick={() => setEditing(row)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Pencil className="size-3.5" />
                            <span className="sr-only">Edit {row.name}</span>
                          </Button>
                          {row.kind === "key" ? (
                            <Button
                              onClick={() => setPendingRotate(row)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              <RefreshCw className="size-3.5" />
                              <span className="sr-only">
                                Replace the key for {row.name}
                              </span>
                            </Button>
                          ) : null}
                          <Button
                            onClick={() => setPendingRevoke(row)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-3.5" />
                            <span className="sr-only">Revoke {row.name}</span>
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>

          <TabsContent className="mt-4" value="clients">
            <OAuthClientsPanel active={active} />
          </TabsContent>
        </Tabs>
      </div>

      <AgentDialog
        accounts={accounts}
        mode="create"
        onOpenChange={setCreatingOpen}
        onSubmit={createAgent}
        open={creatingOpen}
        personas={personas}
        saving={saving}
      />

      <AgentDialog
        initial={editingDraft}
        mode="edit"
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSubmit={(draft) => {
          if (editing) {
            void saveAgent(editing, draft);
          }
        }}
        accounts={accounts}
        open={Boolean(editing)}
        personas={personas}
        saving={saving}
      />

      <ConfirmDestructiveDialog
        confirmLabel="Archive agent"
        description={
          pendingRevoke
            ? pendingRevoke.kind === "grant"
              ? `${pendingRevoke.name} stops working immediately and its tokens are revoked. It moves to your archive, where the threads it opened still name it. Connecting it again means signing in again. This cannot be undone.`
              : `${pendingRevoke.name} stops working immediately and its key can never be used again. It moves to your archive, where the threads it opened still name it. This cannot be undone.`
            : ""
        }
        onConfirm={() => {
          if (pendingRevoke) {
            void revokeAgent(pendingRevoke);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRevoke(null);
          }
        }}
        open={Boolean(pendingRevoke)}
        title="Archive this agent?"
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
