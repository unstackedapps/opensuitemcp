"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  adminCreateSearchResource,
  adminDeleteSearchResource,
  adminSetSearchResourceEnabled,
  adminUpdateSearchResource,
} from "@/app/admin/search/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
  AdminDeleteButton,
  AdminEditButton,
  AdminPanel,
} from "@/components/admin/admin-shell";
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
  isSeededSearchResource,
  MAX_SEARCH_RESOURCES,
} from "@/lib/ai/search-resources";
import type { OrgSearchResourceRow } from "@/lib/org/search-resources";
import { cn } from "@/lib/utils";

type SearchResourcesAdminSectionProps = {
  resources: OrgSearchResourceRow[];
  onAfterChange?: () => void | Promise<void>;
  panelTitle?: string;
};

export function SearchResourcesAdminSection({
  resources,
  onAfterChange,
  panelTitle,
}: SearchResourcesAdminSectionProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OrgSearchResourceRow | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const labelId = useId();
  const urlId = useId();

  const notify = async (
    result: { ok: boolean; error?: string },
    success: string,
  ) => {
    if (result.ok) {
      toast({ type: "success", description: success });
      router.refresh();
      await onAfterChange?.();
      return;
    }
    toast({
      type: "error",
      description: result.error ?? "Request failed.",
    });
  };

  const run = async (
    resourceId: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setPendingId(resourceId);
    const result = await action();
    setPendingId(null);
    await notify(result, success);
  };

  const openAdd = () => {
    setEditing(null);
    setLabel("");
    setUrl("");
    setEditorOpen(true);
  };

  const openEdit = (row: OrgSearchResourceRow) => {
    if (isSeededSearchResource(row)) {
      return;
    }
    setEditing(row);
    setLabel(row.label);
    setUrl(row.url);
    setEditorOpen(true);
  };

  const save = async () => {
    setPendingId(editing?.id ?? "new");
    const result = editing
      ? await adminUpdateSearchResource({
          resourceId: editing.id,
          label,
          url,
        })
      : await adminCreateSearchResource({ label, url });
    setPendingId(null);
    if (result.ok) {
      setEditorOpen(false);
    }
    await notify(
      result,
      editing ? "Search resource updated." : "Search resource added.",
    );
  };

  const addButton = (
    <Button
      className={cn(ADMIN_CONTROL_CLASS, "shrink-0 text-sm")}
      disabled={resources.length >= MAX_SEARCH_RESOURCES}
      onClick={openAdd}
      type="button"
    >
      <Plus className="mr-1 size-3.5" />
      Add resource
    </Button>
  );

  const inlineAddButton = (
    <Button
      className={cn(ADMIN_CONTROL_CLASS, "text-sm")}
      disabled={resources.length >= MAX_SEARCH_RESOURCES}
      onClick={openAdd}
      type="button"
      variant="outline"
    >
      <Plus className="mr-1 size-3.5" />
      Add resource
    </Button>
  );

  const panelContent = (
    <>
      {!panelTitle ? inlineAddButton : null}

      {resources.length === 0 ? (
        <p className="text-muted-foreground text-sm">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {resources.map((row) => {
            const busy = pendingId === row.id;
            const seeded = isSeededSearchResource(row);
            return (
              <li
                className="flex flex-col gap-2 rounded-md border border-border/60 bg-background p-3 sm:flex-row sm:items-center"
                key={row.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{row.label}</p>
                  <p className="break-all text-muted-foreground text-xs">
                    {row.url}
                  </p>
                  {seeded ? (
                    <p className="mt-1 text-muted-foreground text-[11px]">
                      Built-in
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {seeded ? null : (
                    <AdminEditButton
                      disabled={busy}
                      label={`Edit ${row.label}`}
                      onClick={() => openEdit(row)}
                    />
                  )}
                  <Button
                    className={ADMIN_CONTROL_CLASS}
                    disabled={busy}
                    onClick={() =>
                      run(
                        row.id,
                        () =>
                          adminSetSearchResourceEnabled({
                            resourceId: row.id,
                            enabled: !row.enabled,
                          }),
                        row.enabled
                          ? "Search resource disabled."
                          : "Search resource enabled.",
                      )
                    }
                    type="button"
                    variant="outline"
                  >
                    {row.enabled ? "Disable" : "Enable"}
                  </Button>
                  {seeded ? null : (
                    <AdminDeleteButton
                      confirmLabel="Remove"
                      description="This removes the search resource for all users."
                      disabled={busy}
                      label={`Remove ${row.label}`}
                      onConfirm={() =>
                        run(
                          row.id,
                          () =>
                            adminDeleteSearchResource({
                              resourceId: row.id,
                            }),
                          "Search resource removed.",
                        )
                      }
                      title={`Remove ${row.label}?`}
                    />
                  )}
                </div>
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
                className={ADMIN_SELECT_TRIGGER_CLASS}
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
                className={ADMIN_SELECT_TRIGGER_CLASS}
                id={urlId}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://docs.oracle.com/en/cloud/saas/netsuite"
                value={url}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t px-4 py-3">
            <Button
              className={ADMIN_CONTROL_CLASS}
              onClick={() => setEditorOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className={ADMIN_CONTROL_CLASS}
              disabled={pendingId !== null || !label.trim() || !url.trim()}
              onClick={() => void save()}
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (panelTitle) {
    return (
      <AdminPanel action={addButton} title={panelTitle}>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Enabled resources are available to org users in chat. Members cannot
          add or edit these.
        </p>
        {panelContent}
      </AdminPanel>
    );
  }

  return <div className="space-y-3">{panelContent}</div>;
}
