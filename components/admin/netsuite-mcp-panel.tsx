"use client";

import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  adminCreateNetSuiteMcpAccount,
  adminDeleteNetSuiteMcpAccount,
  adminSetNetSuiteMcpAccountEnabled,
  adminUpdateNetSuiteMcpAccountName,
} from "@/app/admin/netsuite/mcp/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
  ADMIN_SKILL_LIST_SCROLL_CLASS,
  AdminDeleteButton,
  AdminEditButton,
  AdminPanel,
} from "@/components/admin/admin-shell";
import { AdminNetSuiteMcpToolsSection } from "@/components/admin/netsuite-mcp-tools-section";
import { NetSuiteMcpVerifySection } from "@/components/admin/netsuite-mcp-verify-section";
import { NetSuiteMcpRedirectUriField } from "@/components/netsuite-mcp-redirect-uri-field";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import { SubmitButton } from "@/components/submit-button";
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
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";
import { cn } from "@/lib/utils";

const compactInputClass = ADMIN_SELECT_TRIGGER_CLASS;

type NetSuiteMcpPanelEmbeddedHeader = {
  title: string;
  description: ReactNode;
};

type NetSuiteMcpPanelProps = {
  accounts: OrgNetSuiteMcpAccountRow[];
  actorConnectedAccountIds: string[];
  oauthReturnPath?: string;
  embedded?: NetSuiteMcpPanelEmbeddedHeader;
};

export function NetSuiteMcpPanel({
  accounts,
  actorConnectedAccountIds,
  oauthReturnPath,
  embedded,
}: NetSuiteMcpPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const accountIdFieldId = useId();
  const nameFieldId = useId();
  const editNameFieldId = useId();

  useEffect(() => {
    const netsuiteConnected = searchParams.get("netsuite_connected");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (netsuiteConnected === "true") {
      toast({
        type: "success",
        description: "NetSuite OAuth test succeeded.",
      });
      router.replace(oauthReturnPath ?? "/admin/netsuite/mcp");
      return;
    }

    if (error?.startsWith("netsuite_") || error === "invalid_callback") {
      toast({
        type: "error",
        description: `NetSuite OAuth failed: ${errorDescription ?? error}`,
      });
      router.replace(oauthReturnPath ?? "/admin/netsuite/mcp");
    }
  }, [searchParams, router, oauthReturnPath]);

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
    netsuiteMcpAccountId: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setPendingId(netsuiteMcpAccountId);
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
      Add MCP
    </Button>
  );

  const panelContent = (
    <>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No MCP connections yet.</p>
      ) : (
        <ul className={ADMIN_SKILL_LIST_SCROLL_CLASS}>
          {accounts.map((row) => {
            const busy = pendingId === row.id;
            const editing = editingId === row.id;
            const actorConnected = actorConnectedAccountIds.some(
              (id) =>
                normalizeNetSuiteAccountId(id) ===
                normalizeNetSuiteAccountId(row.accountId),
            );

            return (
              <li
                className="flex flex-col gap-3 rounded-md border border-border/60 p-3"
                key={row.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{row.name}</p>
                    <p className="wrap-break-word text-muted-foreground text-xs">
                      {row.accountId}
                      {row.oauthClientId
                        ? ` · client ${row.oauthClientId.slice(0, 12)}…`
                        : null}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      {!row.enabled ? (
                        <span className="text-destructive text-[11px]">
                          Disabled
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    {editing ? (
                      <Button
                        className={ADMIN_CONTROL_CLASS}
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        type="button"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    ) : (
                      <AdminEditButton
                        disabled={busy}
                        label={`Edit ${row.name} label`}
                        onClick={() => {
                          setEditingId(row.id);
                          setEditName(row.name);
                        }}
                      />
                    )}
                    <Button
                      className={ADMIN_CONTROL_CLASS}
                      disabled={busy}
                      onClick={() =>
                        run(
                          row.id,
                          () =>
                            adminSetNetSuiteMcpAccountEnabled({
                              netsuiteMcpAccountId: row.id,
                              enabled: !row.enabled,
                            }),
                          row.enabled ? "MCP connection disabled." : "Enabled.",
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      {row.enabled ? "Disable" : "Enable"}
                    </Button>
                    <AdminDeleteButton
                      confirmLabel="Remove"
                      description="This removes the MCP connection. Connected users will lose access."
                      disabled={busy}
                      label="Remove MCP connection"
                      onConfirm={() =>
                        run(
                          row.id,
                          () =>
                            adminDeleteNetSuiteMcpAccount({
                              netsuiteMcpAccountId: row.id,
                            }),
                          "MCP connection removed.",
                        )
                      }
                      title={`Remove ${row.name}?`}
                    />
                  </div>
                </div>

                {editing ? (
                  <div className="flex flex-col gap-3 border-border/60 border-t pt-3">
                    <div className="space-y-2">
                      <Label className="text-xs" htmlFor={editNameFieldId}>
                        Label
                      </Label>
                      <Input
                        className={compactInputClass}
                        id={editNameFieldId}
                        onChange={(event) => setEditName(event.target.value)}
                        value={editName}
                      />
                    </div>
                    <Button
                      className={ADMIN_CONTROL_CLASS}
                      disabled={busy || !editName.trim()}
                      onClick={() =>
                        run(
                          row.id,
                          async () => {
                            const result =
                              await adminUpdateNetSuiteMcpAccountName({
                                netsuiteMcpAccountId: row.id,
                                name: editName.trim(),
                              });
                            if (result.ok) {
                              setEditingId(null);
                            }
                            return result;
                          },
                          "Label updated.",
                        )
                      }
                      type="button"
                    >
                      Save label
                    </Button>
                  </div>
                ) : null}

                <NetSuiteMcpVerifySection
                  account={row}
                  actorConnected={actorConnected}
                  oauthReturnPath={oauthReturnPath}
                  onRefresh={() => router.refresh()}
                  prominentConnect={!actorConnected}
                />

                <AdminNetSuiteMcpToolsSection
                  account={row}
                  actorConnected={actorConnected}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Dialog onOpenChange={setAddOpen} open={addOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle className="text-base">Add MCP connection</DialogTitle>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const formData = new FormData(form);
              const result = await adminCreateNetSuiteMcpAccount({
                accountId: String(formData.get("accountId")),
                name: String(formData.get("name") || ""),
              });
              if (result.ok) {
                toast({
                  type: "success",
                  description: "MCP connection added.",
                });
                setAddOpen(false);
                form.reset();
                router.refresh();
                return;
              }
              toast({
                type: "error",
                description: result.error ?? "Could not add account.",
              });
            }}
          >
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <NetSuiteMcpRedirectUriField />
              <div className="space-y-2">
                <Label className="text-xs" htmlFor={accountIdFieldId}>
                  Account ID
                </Label>
                <Input
                  className={compactInputClass}
                  id={accountIdFieldId}
                  name="accountId"
                  placeholder="1234567"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs" htmlFor={nameFieldId}>
                  Label
                </Label>
                <Input
                  className={compactInputClass}
                  id={nameFieldId}
                  name="name"
                  placeholder="Production"
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t px-4 py-3">
              <Button
                className={ADMIN_CONTROL_CLASS}
                onClick={() => setAddOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <SubmitButton
                className={ADMIN_CONTROL_CLASS}
                isSuccessful={false}
              >
                Save
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
    <AdminPanel
      action={addButton}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      fillViewport
      title="NetSuite MCP Connections"
    >
      {panelContent}
    </AdminPanel>
  );
}
