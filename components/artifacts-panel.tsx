"use client";

import { ArrowLeftIcon, PencilIcon, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PanelBody, PanelHeader } from "@/components/ui/panel-header";
import { SearchInput } from "@/components/ui/search-input";
import { describeEditedAt } from "@/lib/documents/edited-at";
import { cn } from "@/lib/utils";

type ArtifactSummary = {
  id: string;
  path: string;
  title: string | null;
  bytes: number;
  version: number;
  updatedAt: string;
};

type ArtifactBody = ArtifactSummary & { content: string };

async function fetchArtifacts(): Promise<{ artifacts: ArtifactSummary[] }> {
  const response = await fetch("/api/artifacts");
  if (!response.ok) {
    throw new Error("Failed to load artifacts");
  }
  return response.json();
}

/** The first lines, as the tile shows them behind the title. */
function preview(content: string): string {
  return content.split("\n").slice(0, 14).join("\n");
}

function label(artifact: ArtifactSummary): string {
  return artifact.title ?? artifact.path;
}

export function ArtifactsPanel({ active }: { active: boolean }) {
  const { data, error, isLoading, mutate } = useSWR(
    active ? "artifacts" : null,
    fetchArtifacts,
  );
  const titleFieldId = useId();
  const pathFieldId = useId();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [body, setBody] = useState<ArtifactBody | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<ArtifactSummary | null>(
    null,
  );
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftPath, setDraftPath] = useState("");
  // Read per render, so a tile that said 59m ago says 1h ago after the next one.
  const now = new Date();

  const artifacts = data?.artifacts ?? [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return artifacts;
    }
    return artifacts.filter(
      (artifact) =>
        label(artifact).toLowerCase().includes(query) ||
        artifact.path.toLowerCase().includes(query) ||
        (bodies[artifact.id] ?? "").toLowerCase().includes(query),
    );
  }, [artifacts, bodies, search]);

  // Tiles show the document, not an icon, so each body is fetched once and
  // kept. A list capped at 200 is small enough to hold.
  useEffect(() => {
    if (!active) {
      return;
    }
    for (const artifact of artifacts) {
      if (bodies[artifact.id] !== undefined) {
        continue;
      }
      void fetch(`/api/artifacts/${artifact.id}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { artifact: ArtifactBody } | null) => {
          if (payload) {
            setBodies((current) => ({
              ...current,
              [payload.artifact.id]: payload.artifact.content,
            }));
          }
        })
        .catch(() => undefined);
    }
  }, [active, artifacts, bodies]);

  useEffect(() => {
    if (!openId) {
      setBody(null);
      return;
    }
    void fetch(`/api/artifacts/${openId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { artifact: ArtifactBody } | null) => {
        setBody(payload?.artifact ?? null);
      })
      .catch(() => setBody(null));
  }, [openId]);

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    const response = await fetch(`/api/artifacts/${pendingDelete.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast({ type: "error", description: "Failed to delete that artifact." });
      return;
    }
    setPendingDelete(null);
    setOpenId(null);
    await mutate();
  };

  const opened = artifacts.find((artifact) => artifact.id === openId) ?? null;

  const startRename = (artifact: ArtifactSummary) => {
    setDraftTitle(artifact.title ?? "");
    setDraftPath(artifact.path);
    setRenaming(true);
  };

  const saveRename = async () => {
    if (!opened) {
      return;
    }
    const response = await fetch(`/api/artifacts/${opened.id}`, {
      body: JSON.stringify({ path: draftPath, title: draftTitle }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      toast({
        type: "error",
        description: payload?.error ?? "Failed to rename that artifact.",
      });
      return;
    }
    setRenaming(false);
    await mutate();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        actions={
          opened ? (
            <>
              <Button
                className="text-muted-foreground"
                onClick={() => startRename(opened)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <PencilIcon className="size-3.5" />
                <span className="ml-1 text-xs">Rename</span>
              </Button>
              <Button
                className="text-muted-foreground"
                onClick={() => setPendingDelete(opened)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
                <span className="ml-1 text-xs">Delete</span>
              </Button>
            </>
          ) : null
        }
        subtitle={
          opened
            ? `${opened.path} · ${describeEditedAt(new Date(opened.updatedAt), now)}`
            : "Documents a session produced, kept after the chat moves on."
        }
        title={
          opened ? (
            <span className="flex items-center gap-1.5">
              <Button
                className="-ml-1 size-5 px-0"
                onClick={() => setOpenId(null)}
                type="button"
                variant="ghost"
              >
                <ArrowLeftIcon className="size-3.5" />
                <span className="sr-only">Back to artifacts</span>
              </Button>
              {label(opened)}
            </span>
          ) : (
            "Artifacts"
          )
        }
      />

      {opened ? (
        <PanelBody>
          <pre className="whitespace-pre-wrap wrap-break-word font-mono text-xs leading-relaxed">
            {body?.content ?? "Loading…"}
          </pre>
        </PanelBody>
      ) : (
        <>
          {artifacts.length > 0 ? (
            <div className="shrink-0 px-4 pt-1 sm:px-5">
              <SearchInput
                className="h-8 text-sm"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search artifacts"
                value={search}
              />
            </div>
          ) : null}

          <PanelBody className="pt-4">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : null}

            {error ? (
              <p className="text-muted-foreground text-sm">
                Artifacts could not be loaded.
              </p>
            ) : null}

            {!(isLoading || error) && artifacts.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing saved yet. Open a long result in the canvas and press
                Save to keep it here.
              </p>
            ) : null}

            {!(isLoading || error) &&
            artifacts.length > 0 &&
            filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No artifact matches “{search}”.
              </p>
            ) : null}

            {filtered.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((artifact) => (
                  <button
                    className={cn(
                      "group flex h-56 flex-col overflow-hidden rounded-lg border border-border text-left transition-colors",
                      "hover:border-muted-foreground/50",
                    )}
                    key={artifact.id}
                    onClick={() => setOpenId(artifact.id)}
                    type="button"
                  >
                    <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30 px-3 pt-3">
                      <pre className="whitespace-pre-wrap wrap-break-word font-mono text-[10px] text-muted-foreground leading-snug">
                        {preview(bodies[artifact.id] ?? "")}
                      </pre>
                      <div className="absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-background to-transparent" />
                    </div>
                    <div className="shrink-0 space-y-0.5 border-border/60 border-t px-3 py-2">
                      <p className="truncate font-medium text-sm">
                        {label(artifact)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {describeEditedAt(new Date(artifact.updatedAt), now)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </PanelBody>
        </>
      )}

      <Dialog onOpenChange={setRenaming} open={renaming}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rename artifact</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="font-medium text-sm" htmlFor={titleFieldId}>
                Title
              </label>
              <Input
                id={titleFieldId}
                onChange={(event) => setDraftTitle(event.target.value)}
                value={draftTitle}
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-medium text-sm" htmlFor={pathFieldId}>
                Path
              </label>
              <Input
                id={pathFieldId}
                onChange={(event) => setDraftPath(event.target.value)}
                value={draftPath}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setRenaming(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={draftPath.trim().length === 0}
              onClick={() => void saveRename()}
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <AlertDialogTitle>
              Delete “{pendingDelete ? label(pendingDelete) : ""}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
