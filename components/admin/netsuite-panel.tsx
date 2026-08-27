"use client";

import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  adminCreateOidcAccount,
  adminDeleteOidcAccount,
  adminSetOidcAccountEnabled,
  adminUpdateOidcAccount,
} from "@/app/admin/netsuite/oidc/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
  AdminDeleteButton,
  AdminEditButton,
  AdminPanel,
} from "@/components/admin/admin-shell";
import { NetSuiteOidcTestConnectionButton } from "@/components/netsuite-oidc-login-picker";
import { NetSuiteOidcRedirectUriField } from "@/components/netsuite-oidc-redirect-uri-field";
import { NetSuiteOidcSetupGuide } from "@/components/netsuite-oidc-setup-guide";
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
import type { OrgOidcAccountRow } from "@/lib/org/oidc-accounts";
import { cn } from "@/lib/utils";

const compactInputClass = ADMIN_SELECT_TRIGGER_CLASS;

function oidcVerificationStatusClass(verified: boolean): string {
  return verified
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
    : "border-border/80 bg-muted/50 text-muted-foreground";
}

function OidcVerificationStatus({ account }: { account: OrgOidcAccountRow }) {
  const verified = account.oidcVerifiedAt !== null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[10px] leading-none",
          oidcVerificationStatusClass(verified),
        )}
      >
        {verified ? "Verified" : "Not tested"}
      </span>
      {account.oidcVerifiedAt ? (
        <span className="text-[11px] text-muted-foreground">
          Checked {new Date(account.oidcVerifiedAt).toLocaleDateString()}
        </span>
      ) : null}
    </div>
  );
}

function cleanOidcTestReturnPath(returnPath: string): string {
  const url = new URL(returnPath, "http://local");
  url.searchParams.delete("netsuite_connected");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

type NetsuitePanelEmbeddedHeader = {
  title: string;
  description: ReactNode;
  titleAccessory?: ReactNode;
};

type NetsuitePanelProps = {
  accounts: OrgOidcAccountRow[];
  testReturnTo?: string;
  showOidcTest?: boolean;
  showSetupGuide?: boolean;
  embedded?: NetsuitePanelEmbeddedHeader;
};

export function NetsuitePanel({
  accounts,
  testReturnTo,
  showOidcTest = true,
  showSetupGuide = true,
  embedded,
}: NetsuitePanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<OrgOidcAccountRow | null>(
    null,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);

  const testReturnPath =
    testReturnTo ?? "/admin/netsuite/oidc?netsuite_connected=true";

  useEffect(() => {
    const netsuiteConnected = searchParams.get("netsuite_connected");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (netsuiteConnected === "true") {
      toast({
        type: "success",
        description: "NetSuite OIDC test succeeded.",
      });
      const cleanPath = cleanOidcTestReturnPath(testReturnPath);
      router.replace(cleanPath);
      return;
    }

    if (error?.startsWith("netsuite_") || error === "state_mismatch") {
      toast({
        type: "error",
        description: `NetSuite OIDC test failed: ${errorDescription ?? error}`,
      });
      const cleanPath = cleanOidcTestReturnPath(testReturnPath);
      router.replace(cleanPath);
    }
  }, [searchParams, router, testReturnPath]);

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
    oidcAccountId: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setPendingId(oidcAccountId);
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
      Add OIDC
    </Button>
  );

  const titleAccessory = showSetupGuide ? (
    <NetSuiteOidcSetupGuide />
  ) : undefined;

  const panelContent = (
    <>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No OIDC integrations yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((row) => {
            const busy = pendingId === row.id;
            return (
              <li
                className="flex flex-col gap-3 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center"
                key={row.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{row.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {row.accountId}
                    {row.oauthClientId
                      ? ` · client ${row.oauthClientId.slice(0, 12)}…`
                      : null}
                  </p>
                  <OidcVerificationStatus account={row} />
                  {!row.enabled ? (
                    <p className="mt-1 text-destructive text-[11px]">
                      Disabled
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {showOidcTest && row.enabled ? (
                    <NetSuiteOidcTestConnectionButton
                      accountId={row.accountId}
                      className={ADMIN_CONTROL_CLASS}
                      disabled={busy}
                      returnTo={testReturnPath}
                    />
                  ) : null}
                  <AdminEditButton
                    disabled={busy}
                    label={`Edit ${row.name}`}
                    onClick={() => setEditAccount(row)}
                  />
                  <Button
                    className={ADMIN_CONTROL_CLASS}
                    disabled={busy}
                    onClick={() =>
                      run(
                        row.id,
                        () =>
                          adminSetOidcAccountEnabled({
                            oidcAccountId: row.id,
                            enabled: !row.enabled,
                          }),
                        row.enabled ? "OIDC disabled." : "OIDC enabled.",
                      )
                    }
                    type="button"
                    variant="outline"
                  >
                    {row.enabled ? "Disable" : "Enable"}
                  </Button>
                  <AdminDeleteButton
                    confirmLabel="Remove"
                    description="Users will no longer be able to sign in with this NetSuite OIDC integration."
                    disabled={busy}
                    label="Remove OIDC integration"
                    onConfirm={() =>
                      run(
                        row.id,
                        () => adminDeleteOidcAccount({ oidcAccountId: row.id }),
                        "OIDC integration removed.",
                      )
                    }
                    title={`Remove ${row.name}?`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddOidcDialog
        onCreated={() => {
          setAddOpen(false);
          router.refresh();
        }}
        onOpenChange={setAddOpen}
        open={addOpen}
      />

      <EditOidcDialog
        account={editAccount}
        onOpenChange={(open) => {
          if (!open) {
            setEditAccount(null);
          }
        }}
        onSaved={() => {
          setEditAccount(null);
          router.refresh();
        }}
        open={editAccount !== null}
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
          titleAccessory={embedded.titleAccessory ?? titleAccessory}
        />
        {panelContent}
      </div>
    );
  }

  return (
    <AdminPanel
      action={addButton}
      title="OIDC login"
      titleAccessory={titleAccessory}
    >
      {panelContent}
    </AdminPanel>
  );
}

function AddOidcDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const accountIdFieldId = useId();
  const nameFieldId = useId();
  const clientIdFieldId = useId();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            Add OIDC integration
            <NetSuiteOidcSetupGuide />
          </DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const result = await adminCreateOidcAccount({
              accountId: String(formData.get("accountId")),
              clientId: String(formData.get("clientId")),
              name: String(formData.get("name") || "") || undefined,
            });
            if (result.ok) {
              toast({
                type: "success",
                description: "OIDC integration added.",
              });
              form.reset();
              onCreated();
              return;
            }
            toast({
              type: "error",
              description: result.error ?? "Could not add integration.",
            });
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <NetSuiteOidcRedirectUriField />
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={nameFieldId}>
                Label
              </Label>
              <Input
                autoComplete="off"
                className={compactInputClass}
                id={nameFieldId}
                name="name"
                placeholder="Production"
                type="text"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={accountIdFieldId}>
                NetSuite account ID
              </Label>
              <Input
                autoComplete="off"
                className={compactInputClass}
                id={accountIdFieldId}
                name="accountId"
                placeholder="1234567"
                required
                type="text"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={clientIdFieldId}>
                OIDC client ID
              </Label>
              <Input
                autoComplete="off"
                className={compactInputClass}
                id={clientIdFieldId}
                name="clientId"
                placeholder="From NetSuite integration"
                required
                type="password"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-4 py-3">
            <Button
              className={ADMIN_CONTROL_CLASS}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <SubmitButton className={ADMIN_CONTROL_CLASS} isSuccessful={false}>
              Add
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditOidcDialog({
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  account: OrgOidcAccountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const nameFieldId = useId();
  const clientIdFieldId = useId();
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && account) {
      setName(account.name);
      setClientId("");
    }
  }, [open, account]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName("");
      setClientId("");
    }
    onOpenChange(nextOpen);
  };

  if (!account) {
    return null;
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="text-base">Edit OIDC integration</DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            const result = await adminUpdateOidcAccount({
              oidcAccountId: account.id,
              name: name.trim(),
              clientId: clientId.trim() || null,
            });
            setSaving(false);
            if (result.ok) {
              toast({
                type: "success",
                description: "OIDC integration updated.",
              });
              onSaved();
              return;
            }
            toast({
              type: "error",
              description: result.error ?? "Could not update integration.",
            });
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={nameFieldId}>
                Label
              </Label>
              <Input
                autoComplete="off"
                className={compactInputClass}
                id={nameFieldId}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">NetSuite account ID</Label>
              <p className="font-mono text-muted-foreground text-xs">
                {account.accountId}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={clientIdFieldId}>
                OIDC client ID
              </Label>
              <Input
                autoComplete="off"
                className={compactInputClass}
                id={clientIdFieldId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="Leave blank to keep current"
                type="password"
                value={clientId}
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-4 py-3">
            <Button
              className={ADMIN_CONTROL_CLASS}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className={ADMIN_CONTROL_CLASS}
              disabled={saving || !name.trim()}
              type="submit"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
