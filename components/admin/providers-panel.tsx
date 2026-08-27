"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  adminDeleteLlmProvider,
  adminSetLlmProviderEnabled,
} from "@/app/admin/providers/actions";
import {
  ADMIN_CONTROL_CLASS,
  AdminDeleteButton,
  AdminEditButton,
  AdminPanel,
} from "@/components/admin/admin-shell";
import {
  OrgLlmProviderAddDialog,
  OrgLlmProviderEditDialog,
} from "@/components/admin/org-llm-provider-dialog";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { providerTypeLabel } from "@/lib/ai/provider-entries";
import type { OrgLlmProviderRow } from "@/lib/org/llm-providers";
import { cn } from "@/lib/utils";

function displayLabel(row: OrgLlmProviderRow): string {
  return row.modeConfig.label?.trim() || providerTypeLabel(row.providerType);
}

type ProvidersPanelEmbeddedHeader = {
  title: string;
  description: ReactNode;
};

type ProvidersPanelProps = {
  providers: OrgLlmProviderRow[];
  embedded?: ProvidersPanelEmbeddedHeader;
};

export function ProvidersPanel({ providers, embedded }: ProvidersPanelProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<OrgLlmProviderRow | null>(null);

  const notify = (result: { ok: boolean; error?: string }, success: string) => {
    if (result.ok) {
      toast({ type: "success", description: success });
      router.refresh();
      return;
    }
    toast({
      type: "error",
      description: result.error ?? "Request failed.",
    });
  };

  const run = async (
    providerId: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setPendingId(providerId);
    const result = await action();
    setPendingId(null);
    notify(result, success);
  };

  const addButton = (
    <Button
      className={cn(ADMIN_CONTROL_CLASS, "shrink-0 text-sm")}
      onClick={() => setAddOpen(true)}
      type="button"
    >
      <Plus className="mr-1 size-3.5" />
      Add provider
    </Button>
  );

  const panelContent = (
    <>
      {providers.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-muted-foreground text-xs">
          No providers yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {providers.map((row) => {
            const busy = pendingId === row.id;
            const label = displayLabel(row);

            return (
              <li
                className="flex flex-col gap-3 rounded-md border border-border/60 p-3"
                key={row.id}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-muted-foreground text-xs">
                      {providerTypeLabel(row.providerType)}
                      {row.hasOrgApiKey ? " · API key set" : " · No API key"}
                      {row.modeConfig.maxIterations
                        ? ` · max iterations ${row.modeConfig.maxIterations}`
                        : null}
                      {!row.enabled ? " · disabled" : null}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <AdminEditButton
                      disabled={busy}
                      label={`Edit ${label}`}
                      onClick={() => setEditRow(row)}
                    />
                    <Button
                      className={ADMIN_CONTROL_CLASS}
                      disabled={busy}
                      onClick={() =>
                        run(
                          row.id,
                          () =>
                            adminSetLlmProviderEnabled({
                              providerId: row.id,
                              enabled: !row.enabled,
                            }),
                          row.enabled
                            ? "Provider disabled."
                            : "Provider enabled.",
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      {row.enabled ? "Disable" : "Enable"}
                    </Button>
                    <AdminDeleteButton
                      description="Removed for all users."
                      disabled={busy}
                      label={`Delete ${label}`}
                      onConfirm={() =>
                        run(
                          row.id,
                          () =>
                            adminDeleteLlmProvider({
                              providerId: row.id,
                            }),
                          "Provider deleted.",
                        )
                      }
                      title={`Delete ${label}?`}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <OrgLlmProviderAddDialog
        existingRows={providers}
        onCreated={() => router.refresh()}
        onOpenChange={setAddOpen}
        open={addOpen}
      />

      <OrgLlmProviderEditDialog
        existingRows={providers}
        onOpenChange={(open) => {
          if (!open) {
            setEditRow(null);
          }
        }}
        onUpdated={() => {
          setEditRow(null);
          router.refresh();
        }}
        open={editRow !== null}
        row={editRow}
      />
    </>
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

  return (
    <AdminPanel action={addButton} title="LLM Providers">
      {panelContent}
    </AdminPanel>
  );
}
