"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { OnboardingPanelSkeleton } from "@/components/onboarding/onboarding-panel-skeleton";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  assertSearchResourceList,
  isSeededSearchResource,
  MAX_SEARCH_RESOURCES,
  type SearchResourceEntry,
} from "@/lib/ai/search-resources";
import { generateUUID } from "@/lib/utils";

const compactInputClass = "h-8 px-2.5 text-sm";

type WebSearchSettingsEmbedded = {
  title: string;
  description: ReactNode;
};

type WebSearchSettingsProps = {
  resources: SearchResourceEntry[];
  managedByOrg: boolean;
  onPersist: (resources: SearchResourceEntry[]) => Promise<void>;
  disabled?: boolean;
  showSkeletons?: boolean;
  embedded?: WebSearchSettingsEmbedded;
};

export function WebSearchSettings({
  resources,
  managedByOrg,
  onPersist,
  disabled = false,
  showSkeletons = false,
  embedded,
}: WebSearchSettingsProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SearchResourceEntry | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] =
    useState<SearchResourceEntry | null>(null);
  const labelId = useId();
  const urlId = useId();

  const persist = async (next: SearchResourceEntry[], success: string) => {
    const validated = assertSearchResourceList(next);
    await onPersist(validated);
    toast({ type: "success", description: success });
  };

  const openAdd = () => {
    setEditing(null);
    setLabel("");
    setUrl("");
    setEditorOpen(true);
  };

  const openEdit = (resource: SearchResourceEntry) => {
    if (isSeededSearchResource(resource)) {
      return;
    }
    setEditing(resource);
    setLabel(resource.label);
    setUrl(resource.url);
    setEditorOpen(true);
  };

  const saveEditor = async () => {
    setPendingId(editing?.id ?? "new");
    try {
      if (editing) {
        await persist(
          resources.map((item) =>
            item.id === editing.id ? { ...item, label, url } : item,
          ),
          "Search resource updated.",
        );
      } else {
        await persist(
          [
            ...resources,
            {
              id: generateUUID(),
              label,
              url,
              enabled: true,
              catalogId: null,
            },
          ],
          "Search resource added.",
        );
      }
      setEditorOpen(false);
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save search resources.",
      });
    } finally {
      setPendingId(null);
    }
  };

  const toggleEnabled = async (resource: SearchResourceEntry) => {
    setPendingId(resource.id);
    try {
      await persist(
        resources.map((item) =>
          item.id === resource.id ? { ...item, enabled: !item.enabled } : item,
        ),
        resource.enabled
          ? "Search resource disabled."
          : "Search resource enabled.",
      );
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save search resources.",
      });
    } finally {
      setPendingId(null);
    }
  };

  if (showSkeletons) {
    return <OnboardingPanelSkeleton rowClassName="h-10 w-full" rows={4} />;
  }

  const addButton = managedByOrg ? null : (
    <Button
      className="w-full shrink-0 sm:w-auto"
      disabled={disabled || resources.length >= MAX_SEARCH_RESOURCES}
      onClick={openAdd}
      size="sm"
      type="button"
      variant="outline"
    >
      <Plus className="size-4" />
      Add Resource
    </Button>
  );

  const panelContent = (
    <section className="flex flex-col gap-3">
      {!embedded ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="font-medium text-sm">Search resources</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {managedByOrg
                ? "Your organization provides these resources. You can disable them for your chats."
                : "Add sites the assistant can search in chat."}
            </p>
          </div>
          {addButton}
        </div>
      ) : null}

      {resources.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-muted-foreground text-xs">
          No search resources yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {resources.map((resource) => {
            const busy = pendingId === resource.id;
            const seeded = isSeededSearchResource(resource);
            return (
              <li
                className="flex flex-col gap-3 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center"
                key={resource.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {resource.label}
                  </p>
                  <p className="break-all text-muted-foreground text-xs">
                    {resource.url}
                  </p>
                  {seeded ? (
                    <p className="mt-1 text-muted-foreground text-[11px]">
                      Built-in
                    </p>
                  ) : null}
                  {resource.orgDisabled ? (
                    <p className="mt-1 text-destructive text-[11px]">
                      Disabled by your organization
                    </p>
                  ) : null}
                  {!resource.orgDisabled && !resource.enabled ? (
                    <p className="mt-1 text-destructive text-[11px]">
                      Disabled
                    </p>
                  ) : null}
                </div>
                {managedByOrg && !resource.orgDisabled ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className="h-8 px-2.5 text-xs"
                      disabled={busy || disabled}
                      onClick={() => void toggleEnabled(resource)}
                      type="button"
                      variant="outline"
                    >
                      {resource.enabled ? "Disable" : "Enable"}
                    </Button>
                  </div>
                ) : null}
                {managedByOrg ? null : (
                  <div className="flex flex-wrap items-center gap-2">
                    {seeded ? null : (
                      <Button
                        className="h-8 px-2.5 text-xs"
                        disabled={busy || disabled}
                        onClick={() => openEdit(resource)}
                        type="button"
                        variant="outline"
                      >
                        <Pencil className="mr-1 size-3.5" />
                        Edit
                      </Button>
                    )}
                    <Button
                      className="h-8 px-2.5 text-xs"
                      disabled={busy || disabled}
                      onClick={() => void toggleEnabled(resource)}
                      type="button"
                      variant="outline"
                    >
                      {resource.enabled ? "Disable" : "Enable"}
                    </Button>
                    {seeded ? null : (
                      <Button
                        className="h-8 px-2.5 text-xs"
                        disabled={busy || disabled}
                        onClick={() => setPendingRemove(resource)}
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="mr-1 size-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog onOpenChange={setEditorOpen} open={editorOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle className="text-base">
              {editing ? "Edit search resource" : "Add search resource"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={labelId}>
                Label
              </Label>
              <Input
                className={compactInputClass}
                id={labelId}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Oracle NetSuite Help Center"
                value={label}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={urlId}>
                URL
              </Label>
              <Input
                className={compactInputClass}
                id={urlId}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://docs.oracle.com/en/cloud/saas/netsuite"
                value={url}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t px-4 py-3">
            <Button
              onClick={() => setEditorOpen(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={pendingId !== null || !label.trim() || !url.trim()}
              onClick={() => void saveEditor()}
              size="sm"
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        confirmLabel="Remove"
        description="This removes the search resource from chat."
        onConfirm={async () => {
          if (!pendingRemove) {
            return;
          }
          if (isSeededSearchResource(pendingRemove)) {
            throw new Error(
              `${pendingRemove.label} is a built-in resource and cannot be removed.`,
            );
          }
          try {
            await persist(
              resources.filter((item) => item.id !== pendingRemove.id),
              "Search resource removed.",
            );
          } catch (error) {
            toast({
              type: "error",
              description:
                error instanceof Error
                  ? error.message
                  : "Failed to save search resources.",
            });
            throw error;
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemove(null);
          }
        }}
        open={pendingRemove !== null}
        title={
          pendingRemove
            ? `Remove ${pendingRemove.label}?`
            : "Remove search resource?"
        }
      />
    </section>
  );

  if (embedded) {
    return (
      <div className="space-y-6">
        <OnboardingStepProse
          action={addButton}
          description={embedded.description}
          title={embedded.title}
        />
        {panelContent}
      </div>
    );
  }

  return panelContent;
}
