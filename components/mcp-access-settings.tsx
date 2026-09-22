"use client";

import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/utils";
import { toast } from "./toast";

type McpKeySummary = {
  id: string;
  name: string;
  maskedToken: string;
  netsuiteAccountId: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  status: "active" | "revoked" | "expired";
};

type McpKeysResponse = {
  serverEnabled: boolean;
  serverUrl: string;
  policy: {
    enabled: boolean;
    memberAccess: "all" | "selected";
    memberAllowed: boolean;
    maxKeysPerUser: number;
    managedByOrg: boolean;
  };
  keys: McpKeySummary[];
};

const ENDPOINT = "/api/settings/mcp-keys";

function blockedReason(data: McpKeysResponse): string {
  if (!data.serverEnabled) {
    return "Agent access is not enabled on this install. An operator must set OSMCP_MCP_SERVER_ENABLED=true and restart.";
  }
  if (!data.policy.enabled) {
    return "Agent access is turned off for your organization. Ask an administrator to enable it.";
  }
  return "Agent access is limited to selected members of your organization. Ask an administrator to add you.";
}

export function McpAccessPanel({ active }: { active: boolean }) {
  const { data, isLoading, mutate } = useSWR<McpKeysResponse>(
    active ? ENDPOINT : null,
    fetcher,
  );
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

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
        body: JSON.stringify({ name: trimmed }),
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
      await mutate();
      toast({ type: "success", description: "Agent key created." });
    } catch {
      toast({ type: "error", description: "Could not create the key." });
    } finally {
      setCreating(false);
    }
  }, [mutate, name]);

  const revokeKey = useCallback(
    async (keyId: string) => {
      const response = await fetch(`${ENDPOINT}/${keyId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await mutate();
        toast({ type: "success", description: "Agent key revoked." });
      } else {
        toast({ type: "error", description: "Could not revoke the key." });
      }
    },
    [mutate],
  );

  if (isLoading || !data) {
    return (
      <div className="p-4 text-muted-foreground text-sm sm:p-5">Loading…</div>
    );
  }

  const activeKeys = data.keys.filter((key) => key.status === "active");
  const atLimit = activeKeys.length >= data.policy.maxKeysPerUser;
  const blocked = !(
    data.serverEnabled &&
    data.policy.enabled &&
    data.policy.memberAllowed
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 space-y-1 border-border/60 border-b px-4 py-3 sm:px-5">
        <p className="flex items-center gap-1.5 font-medium text-sm">
          <KeyRound className="size-3.5 text-muted-foreground" />
          Agent access
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Let an external AI agent act as you over MCP — your NetSuite
          connection, your permissions, your tool policy. What an agent can
          reach is whatever you have enabled elsewhere in OpenSuiteMCP.
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
                    </div>
                  </div>
                  {key.status === "active" ? (
                    <Button
                      onClick={() => revokeKey(key.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">Revoke {key.name}</span>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
