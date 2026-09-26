"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { toast } from "@/components/toast";
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
import { Textarea } from "@/components/ui/textarea";
import { fetcher } from "@/lib/utils";

/**
 * OAuth clients somebody creates by hand.
 *
 * Almost no one needs this. A modern client registers itself, or publishes a
 * metadata document, and the person never sees a client id at all. It is here
 * for the connectors that ask for an id and a secret up front — Claude's
 * advanced settings, and enterprise tooling built before registration was
 * automatic.
 */

type OAuthClientSummary = {
  id: string;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  copyable: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

const ENDPOINT = "/api/settings/oauth-clients";

/** The callback Claude's hosted apps always return to. */
const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

export function OAuthClientsPanel({ active }: { active: boolean }) {
  const { data, isLoading, mutate } = useSWR<{ clients: OAuthClientSummary[] }>(
    active ? ENDPOINT : null,
    fetcher,
  );
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("Claude");
  const [redirects, setRedirects] = useState(CLAUDE_CALLBACK);
  const [pendingRemove, setPendingRemove] = useState<OAuthClientSummary | null>(
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

  const create = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: name.trim(),
          redirectUris: redirects
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast({
          type: "error",
          description: payload.error ?? "Could not create the client.",
        });
        return;
      }
      await mutate();
      setCreating(false);
      // The secret is returned once. Putting it on the clipboard immediately is
      // the same bargain agent keys make: it is the moment it is needed.
      await copy(payload.clientSecret, "Client secret");
      toast({
        type: "success",
        description: `${payload.client.clientName} created. The secret is on your clipboard.`,
      });
    } catch {
      toast({ type: "error", description: "Could not create the client." });
    } finally {
      setSaving(false);
    }
  }, [copy, mutate, name, redirects]);

  const copySecret = useCallback(
    async (client: OAuthClientSummary) => {
      const response = await fetch(`${ENDPOINT}/${client.id}`);
      if (!response.ok) {
        toast({ type: "error", description: "Could not read the secret." });
        return;
      }
      const payload = await response.json();
      await copy(payload.clientSecret, "Client secret");
    },
    [copy],
  );

  const remove = useCallback(
    async (client: OAuthClientSummary) => {
      const response = await fetch(`${ENDPOINT}/${client.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await mutate();
        toast({
          type: "success",
          description: `${client.clientName} removed.`,
        });
      } else {
        toast({ type: "error", description: "Could not remove the client." });
      }
    },
    [mutate],
  );

  if (isLoading || !data) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs leading-relaxed">
        Most AI clients register themselves and need nothing here. Create one
        only if a connector asks you for an OAuth client ID and secret — then
        paste both into it, alongside this install's server URL.
      </p>

      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs">Your OAuth clients</Label>
        <Button onClick={() => setCreating(true)} size="sm" type="button">
          <Plus className="size-3.5" />
          New client
        </Button>
      </div>

      {data.clients.length === 0 ? (
        <p className="text-muted-foreground text-xs">No OAuth clients yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.clients.map((client) => (
            <li
              className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3"
              key={client.id}
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium text-sm">
                  {client.clientName}
                </p>
                <p className="truncate font-mono text-muted-foreground text-xs">
                  {client.clientId}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {client.redirectUris.join(", ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  onClick={() => copy(client.clientId, "Client ID")}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Copy className="size-3.5" />
                  <span className="sr-only">
                    Copy the client ID for {client.clientName}
                  </span>
                </Button>
                <Button
                  disabled={!client.copyable}
                  onClick={() => copySecret(client)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <span className="text-xs">Secret</span>
                </Button>
                <Button
                  onClick={() => setPendingRemove(client)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">Remove {client.clientName}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New OAuth client</DialogTitle>
            <DialogDescription>
              The callback is whatever the connector says it will return to.
              Claude's hosted apps always use the one filled in below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="oauth-client-name">
                Name
              </Label>
              <Input
                id="oauth-client-name"
                maxLength={128}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="oauth-client-redirects">
                Callback URLs
              </Label>
              <Textarea
                className="font-mono text-xs"
                id="oauth-client-redirects"
                onChange={(event) => setRedirects(event.target.value)}
                rows={3}
                value={redirects}
              />
              <p className="text-muted-foreground text-xs">
                One per line. Each must be https, or http on a loopback address.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setCreating(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={saving || !(name.trim() && redirects.trim())}
              onClick={create}
              type="button"
            >
              {saving ? "Creating…" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        confirmLabel="Remove client"
        description={
          pendingRemove
            ? `${pendingRemove.clientName} will stop working for anything still configured with it. Agents that already signed in through it keep working until you revoke them.`
            : ""
        }
        onConfirm={() => {
          if (pendingRemove) {
            void remove(pendingRemove);
          }
          setPendingRemove(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemove(null);
          }
        }}
        open={Boolean(pendingRemove)}
        title="Remove this OAuth client?"
      />
    </div>
  );
}
