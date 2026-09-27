"use client";

import {
  AlertTriangle,
  ArrowUpDown,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  type AgentAccountOption,
  type AgentCredentials,
  AgentDialog,
  type AgentDraft,
  type AgentPersonaOption,
} from "@/components/agent-dialog";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";
import { CONNECT_AGENT_DOCS_URL } from "@/lib/constants";
import { CALLBACK_PRESETS, connectsFromLabel } from "@/lib/mcp/connect-clients";
import type { AgentConnectionKind } from "@/lib/mcp/server/oauth/grants";
import type { ConnectPreflight } from "@/lib/mcp/server/oauth/preflight";
import { fetcher } from "@/lib/utils";
import { toast } from "./toast";

type McpKeySummary = {
  id: string;
  name: string;
  description: string | null;
  connectsFrom: string | null;
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
  connectsFrom: string | null;
  id: string;
  name: string;
  description: string | null;
  connectionKind: AgentConnectionKind;
  clientName: string;
  clientUri: string | null;
  personaId: string | null;
  netsuiteAccountId: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  connectedAt: string | null;
  issuedClientId: string | null;
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
  description: string | null;
  connectionKind: AgentConnectionKind;
  credential: string;
  personaId: string | null;
  netsuiteAccountId: string | null;
  lastUsedAt: string | null;
  rotatedAt: string | null;
  status: "pending" | "active" | "revoked" | "expired";
  createdAt: string;
  copyable: boolean;
  /** Set when this app issued a client ID for a connector that wanted one. */
  issuedClientId: string | null;
  /** Which AI product it is for: a known id, free text, or unset. */
  connectsFrom: string | null;
};

const CONNECTION_LABEL: Record<AgentConnectionKind, string> = {
  bearer: "Bearer auth",
  "oauth-pending": "OAuth 2.1",
  "oauth-dcr": "OAuth 2.1 · DCR",
  "oauth-cimd": "OAuth 2.1 · CIMD",
  "oauth-client-key": "OAuth 2.1 · client key",
};

const GRANTS_ENDPOINT = "/api/settings/agent-grants";

const ENDPOINT = "/api/settings/mcp-keys";

function blockedReason(data: McpKeysResponse): string {
  if (!data.policy.enabled) {
    return "Agent apps are turned off for your organization. Ask an administrator to enable it.";
  }
  return "Agent apps are limited to selected members of your organization. Ask an administrator to add you.";
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
  /**
   * Credentials are shown once, on creation, like the key.
   *
   * They exist only for connectors that demand an ID and secret instead of
   * registering themselves, and they belong to the app they were issued from:
   * they can connect that one and no other.
   */
  const [credentials, setCredentials] = useState<AgentCredentials | null>(null);
  const [credentialsBusy, setCredentialsBusy] = useState(false);
  const [pendingPurge, setPendingPurge] = useState<AgentRow | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "used">("recent");
  const [issued, setIssued] = useState<{
    name: string;
    clientId: string;
    clientSecret: string;
  } | null>(null);
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
        await copy(payload.token, "Bearer auth");
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
            description: draft.description || null,
            personaId: draft.personaId,
            netsuiteAccountId: draft.netsuiteAccountId,
            issueClientCredentials: signingIn && draft.issueClientCredentials,
            callbackUrl: draft.callbackUrl,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          toast({
            type: "error",
            description: payload.error ?? "Could not create the app.",
          });
          return;
        }

        setCreatingOpen(false);
        await mutate();
        await onChanged?.();

        if (signingIn) {
          if (payload.clientSecret) {
            setIssued({
              name: draft.name,
              clientId: payload.clientId,
              clientSecret: payload.clientSecret,
            });
            return;
          }
          toast({
            type: "success",
            description: `${draft.name} is waiting. Paste the server URL into your AI and approve it.`,
          });
          return;
        }

        await copy(payload.token, "Bearer auth");
        toast({
          type: "success",
          description: `${draft.name} created. Its key is on your clipboard.`,
        });
      } catch {
        toast({ type: "error", description: "Could not create the app." });
      } finally {
        setSaving(false);
      }
    },
    [copy, mutate, onChanged],
  );

  /**
   * The callback lives on the client row, not the app, so saving an app with
   * client credentials is two requests. Errors surface here; success is left
   * to the caller, so one Save produces one message.
   */
  const saveCallback = useCallback(async (row: AgentRow, url: string) => {
    try {
      const response = await fetch(`${GRANTS_ENDPOINT}/${row.id}/credentials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUris: [url] }),
      });
      if (!response.ok) {
        const payload = await response.json();
        toast({
          type: "error",
          description: payload.error ?? "Could not save the callback URL.",
        });
      }
    } catch {
      toast({ type: "error", description: "Could not save the callback URL." });
    }
  }, []);

  const saveAgent = useCallback(
    async (row: AgentRow, draft: AgentDraft) => {
      // The callback lives on the client, not the app, so it is a second
      // request — but one Save button, because they are one edit.
      if (
        row.connectionKind === "oauth-client-key" &&
        draft.callbackUrl.trim()
      ) {
        await saveCallback(row, draft.callbackUrl.trim());
      }
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
            description: payload.error ?? "Could not save the app.",
          });
          return;
        }

        setEditing(null);
        await mutate();
        toast({ type: "success", description: `${draft.name} saved.` });
      } catch {
        toast({ type: "error", description: "Could not save the app." });
      } finally {
        setSaving(false);
      }
    },
    [mutate, saveCallback],
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
        await copy(payload.token, "Bearer auth");
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

  /** Opening an app clears whatever the last one revealed. */
  const openApp = useCallback((row: AgentRow) => {
    setCredentials(null);
    setEditing(row);
  }, []);

  const loadCredentials = useCallback(
    async (row: AgentRow, rotate: boolean) => {
      setCredentialsBusy(true);
      try {
        const response = await fetch(
          `${GRANTS_ENDPOINT}/${row.id}/credentials`,
          { method: rotate ? "POST" : "GET" },
        );
        const payload = await response.json();
        if (!response.ok) {
          toast({
            type: "error",
            description: payload.error ?? "Could not read the credentials.",
          });
          return;
        }
        setCredentials(payload);
        if (rotate) {
          toast({
            type: "success",
            description: "New secret issued. The client ID is unchanged.",
          });
        }
      } catch {
        toast({
          type: "error",
          description: "Could not read the credentials.",
        });
      } finally {
        setCredentialsBusy(false);
      }
    },
    [],
  );

  const purgeAgent = useCallback(
    async (row: AgentRow) => {
      const base = row.kind === "grant" ? GRANTS_ENDPOINT : ENDPOINT;
      const response = await fetch(`${base}/${row.id}?purge=1`, {
        method: "DELETE",
      });
      if (response.ok) {
        await mutate();
        await onChanged?.();
        toast({ type: "success", description: `${row.name} deleted.` });
      } else {
        toast({ type: "error", description: "Could not delete the app." });
      }
    },
    [mutate, onChanged],
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
        toast({ type: "error", description: "Could not archive the app." });
      }
    },
    [mutate, onChanged],
  );

  const editingDraft = useMemo<AgentDraft | undefined>(
    () =>
      editing
        ? {
            name: editing.name,
            description: editing.description ?? "",
            personaId: editing.personaId ?? AVA_PERSONA_ID,
            netsuiteAccountId: editing.netsuiteAccountId,
            connectsFrom: editing.connectsFrom ?? "",
            issueClientCredentials: false,
            callbackUrl: CALLBACK_PRESETS[0].url,
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
      description: key.description,
      connectionKind: "bearer" as const,
      credential: key.maskedToken,
      personaId: key.personaId,
      netsuiteAccountId: key.netsuiteAccountId,
      lastUsedAt: key.lastUsedAt,
      rotatedAt: key.rotatedAt,
      createdAt: key.createdAt,
      status: key.status,
      copyable: key.copyable,
      issuedClientId: null,
      connectsFrom: key.connectsFrom ?? null,
    })),
    ...(data.grants ?? []).map((grant) => ({
      id: grant.id,
      kind: "grant" as const,
      name: grant.name,
      description: grant.description,
      connectionKind: grant.connectionKind,
      credential: grant.clientName
        ? `Signed in · ${grant.clientName}`
        : "Waiting for an app to sign in",
      issuedClientId: grant.issuedClientId,
      connectsFrom: grant.connectsFrom ?? null,
      personaId: grant.personaId,
      netsuiteAccountId: grant.netsuiteAccountId,
      lastUsedAt: grant.lastUsedAt,
      rotatedAt: null,
      createdAt: grant.createdAt,
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
  const needle = query.trim().toLowerCase();
  const visibleRows = (showArchived ? rows : activeRows)
    .filter(
      (row) =>
        !needle ||
        [
          row.name,
          row.description,
          connectsFromLabel(row.connectsFrom),
          personaLabel(row.personaId, personas),
        ]
          .filter(Boolean)
          .some((field) => (field as string).toLowerCase().includes(needle)),
    )
    .sort((a, b) => {
      if (sort === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sort === "used") {
        // Never-used sorts last rather than first: a row with no date is not
        // the most recently used one.
        return (
          new Date(b.lastUsedAt ?? 0).getTime() -
          new Date(a.lastUsedAt ?? 0).getTime()
        );
      }
      return (
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime()
      );
    });
  const atLimit = activeRows.length >= data.policy.maxKeysPerUser;
  const blocked = !(data.policy.enabled && data.policy.memberAllowed);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-1 border-border/60 border-b px-4 py-3 sm:px-5">
        <p className="flex items-center gap-1.5 font-medium text-sm">
          <KeyRound className="size-3.5 text-muted-foreground" />
          Agent apps
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          An agent app acts as you over MCP, reaching what you have enabled in
          OpenSuiteMCP.
        </p>
      </div>

      <div className="shrink-0 space-y-5 p-4 pb-0 sm:p-5 sm:pb-0">
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
            This install's public address —{" "}
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

        <section className="space-y-2">
          {/* Matches the AI Provider panel: title and button on one line, the
              description under the title, then the list. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-sm">Apps and credentials</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Each app holds its own credential, persona and NetSuite account.
              </p>
            </div>
            <Button
              className="shrink-0"
              disabled={blocked || atLimit}
              onClick={() => setCreatingOpen(true)}
              size="sm"
              type="button"
            >
              <Plus className="size-3.5" />
              New app
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {rows.length > 1 ? (
              <>
                <Input
                  className="h-8 min-w-40 flex-1 text-xs"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter apps"
                  value={query}
                />
                <Select
                  onValueChange={(value) =>
                    setSort(value as "recent" | "name" | "used")
                  }
                  value={sort}
                >
                  <SelectTrigger className="h-8 w-auto gap-1.5 text-xs">
                    <ArrowUpDown className="size-3.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Newest</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="used">Last used</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : null}

            {archivedRows.length > 0 ? (
              <div className="flex items-center gap-2">
                <Label
                  className="text-muted-foreground text-xs"
                  htmlFor="show-archived-apps"
                >
                  Archived
                </Label>
                <Switch
                  checked={showArchived}
                  id="show-archived-apps"
                  onCheckedChange={setShowArchived}
                />
              </div>
            ) : null}
          </div>

          {atLimit ? (
            <p className="text-muted-foreground text-xs">
              You have reached the limit of {data.policy.maxKeysPerUser} active
              agent apps. Revoke one to create another.
            </p>
          ) : null}
        </section>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 sm:px-5 sm:pb-5">
        <section className="space-y-2">
          {visibleRows.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {activeRows.length === 0
                ? "No agent apps yet. Create one, then point your AI at the server URL above."
                : "No agent apps to show."}
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleRows.map((row) => (
                <li
                  className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3"
                  key={`${row.kind}-${row.id}`}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium text-sm">{row.name}</p>
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
                      <Badge variant="outline">
                        {CONNECTION_LABEL[row.connectionKind]}
                      </Badge>
                      {row.connectsFrom ? (
                        <Badge variant="outline">
                          {connectsFromLabel(row.connectsFrom)}
                        </Badge>
                      ) : null}
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
                  <div className="flex shrink-0 items-center gap-1">
                    {row.status === "revoked" || row.status === "expired" ? (
                      <Button
                        onClick={() => setPendingPurge(row)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">
                          Delete {row.name} permanently
                        </span>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => openApp(row)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Pencil className="size-3.5" />
                        <span className="sr-only">Open {row.name}</span>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDestructiveDialog
        confirmLabel="Delete permanently"
        description={`${pendingPurge?.name ?? "This app"} and its history will be removed for good. This cannot be undone.`}
        onConfirm={() => {
          if (pendingPurge) {
            void purgeAgent(pendingPurge);
          }
          setPendingPurge(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingPurge(null);
          }
        }}
        open={Boolean(pendingPurge)}
        title="Delete this agent app permanently?"
      />

      <CredentialsDialog
        issued={issued}
        onClose={() => setIssued(null)}
        serverUrl={data.serverUrl}
      />

      <AgentDialog
        accounts={accounts}
        mode="create"
        onOpenChange={setCreatingOpen}
        onSubmit={createAgent}
        open={creatingOpen}
        personas={personas}
        saving={saving}
        serverUrl={data.serverUrl}
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
        app={
          editing
            ? {
                kind: editing.kind,
                connectionLabel: CONNECTION_LABEL[editing.connectionKind],
                hasClientCredentials:
                  editing.connectionKind === "oauth-client-key",
                credential: editing.credential,
                copyable: editing.copyable,
              }
            : null
        }
        busy={credentialsBusy}
        credentials={credentials}
        onCopy={copy}
        onCopyKey={() => editing && copyKey(editing)}
        onReplaceKey={() => {
          if (editing) {
            setPendingRotate(editing);
            setEditing(null);
          }
        }}
        onRevealCredentials={() => editing && loadCredentials(editing, false)}
        onRevoke={() => {
          if (editing) {
            setPendingRevoke(editing);
            setEditing(null);
          }
        }}
        onRotateSecret={() => editing && loadCredentials(editing, true)}
        open={Boolean(editing)}
        personas={personas}
        saving={saving}
        serverUrl={data.serverUrl}
      />

      <ConfirmDestructiveDialog
        confirmLabel="Archive app"
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
        title="Archive this agent app?"
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
        title="Replace this app's token?"
      />
    </div>
  );
}

/**
 * The client ID and secret, shown once.
 *
 * Same bargain the bearer token makes, for the same reason: the secret is stored
 * only as a hash after this. It names the app it belongs to because that is
 * the whole point of the binding — these credentials connect that app and no
 * other, so pasting them into a second connector will not work.
 */
function CredentialsDialog({
  issued,
  onClose,
  serverUrl,
}: {
  issued: { name: string; clientId: string; clientSecret: string } | null;
  onClose: () => void;
  serverUrl: string;
}) {
  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ type: "success", description: `${what} copied.` });
    } catch {
      toast({ type: "error", description: `Could not copy the ${what}.` });
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={Boolean(issued)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{issued?.name} is ready to connect</DialogTitle>
          <DialogDescription>The secret is shown once.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Field
            label="Server URL"
            onCopy={() => copy(serverUrl, "Server URL")}
            value={serverUrl}
          />
          <Field
            label="Client ID"
            onCopy={() => copy(issued?.clientId ?? "", "Client ID")}
            value={issued?.clientId ?? ""}
          />
          <Field
            label="Client secret"
            onCopy={() => copy(issued?.clientSecret ?? "", "Client secret")}
            value={issued?.clientSecret ?? ""}
          />
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input className="font-mono text-xs" readOnly value={value} />
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
      </div>
    </div>
  );
}
