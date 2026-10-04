"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PanelBody, PanelHeader } from "@/components/ui/panel-header";
import { PANEL_ROW } from "@/components/ui/panel-list";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { describeEditedAt } from "@/lib/documents/edited-at";
import { isMemoryStale } from "@/lib/documents/memory";
import { cn } from "@/lib/utils";

type Memory = {
  id: string;
  path: string;
  fact: string;
  netsuiteAccountId: string | null;
  updatedAt: string;
};

type MemoryAccount = { accountId: string; label: string };

/** The filter value when no account has been picked. */
const EVERY_SCOPE = "__all__";
/** A Select cannot hold null, and a memory can carry no account. */
const NO_ACCOUNT = "__none__";

async function fetchMemory(): Promise<{
  memories: Memory[];
  accounts: MemoryAccount[];
  activeAccountId: string | null;
  memoryEnabled: boolean;
}> {
  const response = await fetch("/api/memory");
  if (!response.ok) {
    throw new Error("Failed to load memory");
  }
  return response.json();
}

export function MemoryPanel({ active }: { active: boolean }) {
  const { data, error, isLoading, mutate } = useSWR(
    active ? "memory" : null,
    fetchMemory,
  );
  const switchId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Memory | null>(null);
  const [purging, setPurging] = useState(false);
  const [scope, setScope] = useState<string>(EVERY_SCOPE);
  const [search, setSearch] = useState("");
  const [draftAccount, setDraftAccount] = useState<string>(NO_ACCOUNT);

  const now = new Date();
  const allMemories = data?.memories ?? [];
  const accounts = data?.accounts ?? [];
  const enabled = data?.memoryEnabled ?? true;

  // A memory learned in sandbox must be findable as a sandbox memory. Reviewing
  // a mixed list is how one gets read as true of production.
  const scoped =
    scope === EVERY_SCOPE
      ? allMemories
      : allMemories.filter((memory) => memory.netsuiteAccountId === scope);

  const needle = search.trim().toLowerCase();
  const memories = needle
    ? scoped.filter(
        (memory) =>
          memory.fact.toLowerCase().includes(needle) ||
          memory.path.toLowerCase().includes(needle),
      )
    : scoped;

  const accountLabel = (accountId: string | null) => {
    if (accountId === null) {
      return "No account";
    }
    return (
      accounts.find((account) => account.accountId === accountId)?.label ??
      `${accountId} — not connected`
    );
  };

  const setEnabled = async (next: boolean) => {
    await mutate(data ? { ...data, memoryEnabled: next } : data, {
      revalidate: false,
    });
    const response = await fetch("/api/memory", {
      body: JSON.stringify({ memoryEnabled: next }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) {
      toast({ type: "error", description: "Failed to save that setting." });
    }
    await mutate();
  };

  const saveEdit = async (memory: Memory) => {
    // Only send the account when it moved. An account that was disconnected
    // after the memory was written is no longer a value the server accepts,
    // and leaving that memory alone must not fail.
    const current = memory.netsuiteAccountId ?? NO_ACCOUNT;
    const moved = draftAccount !== current;
    const response = await fetch(`/api/memory/${memory.id}`, {
      body: JSON.stringify({
        fact: draft,
        ...(moved
          ? {
              netsuiteAccountId:
                draftAccount === NO_ACCOUNT ? null : draftAccount,
            }
          : {}),
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      toast({
        type: "error",
        description: payload?.error ?? "Failed to save that memory.",
      });
      return;
    }
    setEditingId(null);
    await mutate();
  };

  const confirmPurge = async () => {
    const response = await fetch("/api/memory", { method: "DELETE" });
    if (!response.ok) {
      toast({ type: "error", description: "Failed to forget everything." });
      return;
    }
    setPurging(false);
    await mutate();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    const response = await fetch(`/api/memory/${pendingDelete.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast({ type: "error", description: "Failed to delete that memory." });
      return;
    }
    setPendingDelete(null);
    await mutate();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        actions={
          allMemories.length > 0 ? (
            <Button
              className="text-muted-foreground"
              onClick={() => setPurging(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-3.5" />
              <span className="ml-1 text-xs">Forget all</span>
            </Button>
          ) : null
        }
        subtitle="Facts you asked to be remembered, read at the start of every chat."
        title="Memory"
      />

      <PanelBody className="pt-4">
        <SettingRow
          control={
            <Switch
              checked={enabled}
              id={switchId}
              onCheckedChange={(next) => void setEnabled(next)}
            />
          }
          description="Off stops the reading as well as the writing. Nothing is deleted."
          title="Use memory in chats"
        />

        {allMemories.length > 0 ? (
          <div className="sticky top-0 z-10 flex items-center gap-2 bg-background pt-1 pb-3">
            <div className="min-w-0 flex-1">
              <SearchInput
                aria-label="Search memories"
                className="h-8 text-sm"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search memories"
                value={search}
              />
            </div>
            <Select onValueChange={setScope} value={scope}>
              <SelectTrigger className="h-8 w-64 shrink-0 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EVERY_SCOPE}>All memories</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.accountId} value={account.accountId}>
                    {account.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : null}

        {error ? (
          <p className="text-muted-foreground text-sm">
            Memory could not be loaded.
          </p>
        ) : null}

        {!(isLoading || error) && allMemories.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing remembered yet. Tell a chat to remember something and it
            lands here.
          </p>
        ) : null}

        {!(isLoading || error) &&
        allMemories.length > 0 &&
        memories.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {needle
              ? `No memory matches \u201c${search}\u201d.`
              : `Nothing remembered for ${accountLabel(scope)}.`}
          </p>
        ) : null}

        {memories.length > 0 ? (
          <div className="divide-y divide-border/60">
            {memories.map((memory) => {
              const updatedAt = new Date(memory.updatedAt);
              const stale = isMemoryStale(updatedAt, now);
              const editing = editingId === memory.id;
              return (
                <div className={cn(PANEL_ROW)} key={memory.id}>
                  {editing ? (
                    <Textarea
                      autoFocus
                      className="min-h-20 text-sm"
                      onChange={(event) => setDraft(event.target.value)}
                      value={draft}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {memory.fact}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {editing ? (
                      <div className="min-w-0 flex-1">
                        <Select
                          onValueChange={setDraftAccount}
                          value={draftAccount}
                        >
                          <SelectTrigger
                            aria-label="NetSuite account"
                            className="h-8 w-64 text-sm"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_ACCOUNT}>
                              No account
                            </SelectItem>
                            {accounts.map((account) => (
                              <SelectItem
                                key={account.accountId}
                                value={account.accountId}
                              >
                                {account.label}
                              </SelectItem>
                            ))}
                            {memory.netsuiteAccountId &&
                            !accounts.some(
                              (account) =>
                                account.accountId === memory.netsuiteAccountId,
                            ) ? (
                              <SelectItem value={memory.netsuiteAccountId}>
                                {accountLabel(memory.netsuiteAccountId)}
                              </SelectItem>
                            ) : null}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <p className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                        {memory.path} · {accountLabel(memory.netsuiteAccountId)}{" "}
                        · {describeEditedAt(updatedAt, now)}
                        {stale ? " · worth confirming" : ""}
                      </p>
                    )}
                    {editing ? (
                      <>
                        <Button
                          onClick={() => setEditingId(null)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => void saveEdit(memory)}
                          size="sm"
                          type="button"
                        >
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => {
                            setDraft(memory.fact);
                            setDraftAccount(
                              memory.netsuiteAccountId ?? NO_ACCOUNT,
                            );
                            setEditingId(memory.id);
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Edit
                        </Button>
                        <Button
                          className="text-muted-foreground"
                          onClick={() => setPendingDelete(memory)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </PanelBody>

      <AlertDialog onOpenChange={setPurging} open={purging}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Forget all {allMemories.length}{" "}
              {allMemories.length === 1 ? "memory" : "memories"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. To stop memory being used without deleting
              anything, switch it off instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPurge()}>
              Forget all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget this?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.fact}” This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Forget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
