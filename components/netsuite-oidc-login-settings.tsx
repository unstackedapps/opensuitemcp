"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";
import useSWR from "swr";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { NetSuiteOidcTestConnectionButton } from "@/components/netsuite-oidc-login-picker";
import { NetSuiteOidcRedirectUriField } from "@/components/netsuite-oidc-redirect-uri-field";
import { NetSuiteOidcSetupGuide } from "@/components/netsuite-oidc-setup-guide";
import { OnboardingPanelSkeleton } from "@/components/onboarding/onboarding-panel-skeleton";
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
import type {
  SoloOidcLoginAccount,
  SoloOidcLoginSettings,
} from "@/lib/org/solo-oidc-login-types";
import { cn } from "@/lib/utils";

const compactInputClass = "h-8 px-2.5 text-sm";

function cleanOidcTestReturnPath(returnPath: string): string {
  const url = new URL(returnPath, "http://local");
  url.searchParams.delete("netsuite_connected");
  url.searchParams.delete("oidc_email_linked");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

async function fetchSoloOidcLoginSettings(): Promise<SoloOidcLoginSettings> {
  const response = await fetch("/api/netsuite/login-oidc");
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload.error || "Failed to load NetSuite sign-in settings.",
    );
  }
  return response.json() as Promise<SoloOidcLoginSettings>;
}

type NetSuiteOidcLoginSettingsEmbedded = {
  title: string;
  description: ReactNode;
};

type NetSuiteOidcLoginSettingsProps = {
  active: boolean;
  testReturnTo?: string;
  showOidcTest?: boolean;
  embedded?: NetSuiteOidcLoginSettingsEmbedded;
};

export function NetSuiteOidcLoginSettings({
  active,
  testReturnTo,
  showOidcTest = true,
  embedded,
}: NetSuiteOidcLoginSettingsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, error, isLoading, mutate } = useSWR(
    active ? "solo-oidc-login" : null,
    fetchSoloOidcLoginSettings,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<SoloOidcLoginAccount | null>(
    null,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] =
    useState<SoloOidcLoginAccount | null>(null);

  useEffect(() => {
    if (!testReturnTo) {
      return;
    }

    const netsuiteConnected = searchParams.get("netsuite_connected");
    const linkedEmail = searchParams.get("oidc_email_linked");
    const oauthError = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (netsuiteConnected === "true") {
      toast({
        type: "success",
        description: linkedEmail
          ? `NetSuite OIDC verified and linked ${linkedEmail}.`
          : "NetSuite OIDC test succeeded.",
      });
      router.replace(cleanOidcTestReturnPath(testReturnTo));
      return;
    }

    if (linkedEmail) {
      toast({
        type: "success",
        description: `Linked NetSuite login email ${linkedEmail}.`,
      });
      router.replace(cleanOidcTestReturnPath(testReturnTo));
      return;
    }

    if (
      oauthError?.startsWith("netsuite_") ||
      oauthError === "state_mismatch"
    ) {
      toast({
        type: "error",
        description: `NetSuite OIDC test failed: ${errorDescription ?? oauthError}`,
      });
      router.replace(cleanOidcTestReturnPath(testReturnTo));
    }
  }, [searchParams, router, testReturnTo]);

  if (isLoading && !data) {
    return <OnboardingPanelSkeleton rowClassName="h-16 w-full" />;
  }

  if (error || !data) {
    return (
      <p className="text-destructive text-xs">
        {error instanceof Error
          ? error.message
          : "Failed to load NetSuite sign-in settings."}
      </p>
    );
  }

  const runAccountAction = async (
    oidcAccountId: string,
    action: () => Promise<Response>,
    successMessage: string,
  ) => {
    setPendingId(oidcAccountId);
    try {
      const response = await action();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Request failed.");
      }
      await mutate(payload.settings ?? undefined, { revalidate: true });
      toast({ type: "success", description: successMessage });
    } catch (actionError) {
      toast({
        type: "error",
        description:
          actionError instanceof Error
            ? actionError.message
            : "Request failed.",
      });
    } finally {
      setPendingId(null);
    }
  };

  const addButton = (
    <Button
      className="w-full shrink-0 sm:w-auto"
      onClick={() => setAddOpen(true)}
      size="sm"
      type="button"
      variant="outline"
    >
      <Plus className="size-4" />
      Add Integration
    </Button>
  );

  const panelContent = (
    <>
      {data.source === "env" ? (
        <p className="rounded-md border border-dashed p-3 text-muted-foreground text-[11px]">
          NetSuite account{" "}
          <code className="text-[11px]">{data.envAccountId}</code> and OIDC
          client ID were set during install. Saving below overrides install env
          for sign-in.
        </p>
      ) : null}

      {data.accounts.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No NetSuite sign-in integrations yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.accounts.map((account) => {
            const busy = pendingId === account.id;
            return (
              <li
                className="flex flex-col gap-3 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center"
                key={account.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-sm">
                      {account.name}
                    </p>
                    {account.linkedLoginEmail ? (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-[10px] text-emerald-800 leading-none dark:text-emerald-300">
                        Email linked
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {account.accountId}
                    {account.clientIdPreview
                      ? ` · client ${account.clientIdPreview}`
                      : null}
                  </p>
                  {account.linkedLoginEmail ? (
                    <p className="mt-1 text-muted-foreground text-[11px]">
                      Login email:{" "}
                      <span className="font-mono text-foreground/90">
                        {account.linkedLoginEmail}
                      </span>
                    </p>
                  ) : null}
                  {!account.enabled ? (
                    <p className="mt-1 text-destructive text-[11px]">
                      Disabled — hidden on login page
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {showOidcTest && testReturnTo && account.enabled ? (
                    <NetSuiteOidcTestConnectionButton
                      accountId={account.accountId}
                      className="h-8 px-2.5 text-xs"
                      disabled={busy}
                      returnTo={testReturnTo}
                    />
                  ) : null}
                  <Button
                    className="h-8 px-2.5 text-xs"
                    disabled={busy}
                    onClick={() => setEditAccount(account)}
                    type="button"
                    variant="outline"
                  >
                    <Pencil className="mr-1 size-3.5" />
                    Edit
                  </Button>
                  <Button
                    className="h-8 px-2.5 text-xs"
                    disabled={busy}
                    onClick={() =>
                      runAccountAction(
                        account.id,
                        () =>
                          fetch("/api/netsuite/login-oidc", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              oidcAccountId: account.id,
                              enabled: !account.enabled,
                            }),
                          }),
                        account.enabled
                          ? "NetSuite sign-in disabled."
                          : "NetSuite sign-in enabled.",
                      )
                    }
                    type="button"
                    variant="outline"
                  >
                    {account.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    className="h-8 px-2.5 text-xs"
                    disabled={busy}
                    onClick={() => setPendingRemove(account)}
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="mr-1 size-3.5" />
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showOidcTest &&
      testReturnTo &&
      data.accounts.length === 0 &&
      data.source === "env" &&
      data.envAccountId ? (
        <div className="rounded-md border border-dashed border-border/60 p-3">
          <p className="mb-2 text-muted-foreground text-xs leading-relaxed">
            Sign in with NetSuite to verify install env credentials.
          </p>
          <NetSuiteOidcTestConnectionButton
            accountId={data.envAccountId}
            className="h-8 px-2.5 text-xs"
            returnTo={testReturnTo}
          />
        </div>
      ) : null}

      <OidcIntegrationDialog
        account={null}
        onOpenChange={setAddOpen}
        onSaved={async () => {
          setAddOpen(false);
          await mutate();
        }}
        open={addOpen}
      />

      <OidcIntegrationDialog
        account={editAccount}
        onOpenChange={(open) => {
          if (!open) {
            setEditAccount(null);
          }
        }}
        onSaved={async () => {
          setEditAccount(null);
          await mutate();
        }}
        open={editAccount !== null}
      />

      <ConfirmDestructiveDialog
        confirmLabel="Remove"
        description="This removes the NetSuite sign-in integration from the login page."
        onConfirm={() => {
          if (!pendingRemove) {
            return;
          }
          return runAccountAction(
            pendingRemove.id,
            () =>
              fetch("/api/netsuite/login-oidc", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  oidcAccountId: pendingRemove.id,
                }),
              }),
            "NetSuite sign-in integration removed.",
          );
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemove(null);
          }
        }}
        open={pendingRemove !== null}
        title={
          pendingRemove
            ? `Remove ${pendingRemove.name}?`
            : "Remove integration?"
        }
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
          titleAccessory={<NetSuiteOidcSetupGuide />}
        />
        {panelContent}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">Sign in with NetSuite</h3>
            <NetSuiteOidcSetupGuide />
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            OIDC for the login page.
          </p>
        </div>
        {addButton}
      </div>
      {panelContent}
    </section>
  );
}

function OidcIntegrationDialog({
  open,
  onOpenChange,
  onSaved,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
  account: SoloOidcLoginAccount | null;
}) {
  const nameFieldId = useId();
  const accountIdFieldId = useId();
  const clientIdFieldId = useId();
  const isEdit = account !== null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isEdit ? "Edit OIDC integration" : "Add OIDC integration"}
            {!isEdit ? <NetSuiteOidcSetupGuide /> : null}
          </DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const accountId = String(formData.get("accountId") ?? "").trim();
            const clientId = String(formData.get("clientId") ?? "").trim();
            const name = String(formData.get("name") ?? "").trim();

            if (!accountId) {
              toast({
                type: "error",
                description: "NetSuite account ID is required.",
              });
              return;
            }

            if (!isEdit && !clientId) {
              toast({
                type: "error",
                description: "OIDC client ID is required.",
              });
              return;
            }

            try {
              const response = await fetch("/api/netsuite/login-oidc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  accountId,
                  clientId: clientId || undefined,
                  name: name || undefined,
                  oidcAccountId: account?.id,
                }),
              });
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error(payload.error || "Could not save integration.");
              }
              toast({
                type: "success",
                description: isEdit
                  ? "OIDC integration updated."
                  : "OIDC integration added.",
              });
              form.reset();
              await onSaved();
            } catch (submitError) {
              toast({
                type: "error",
                description:
                  submitError instanceof Error
                    ? submitError.message
                    : "Could not save integration.",
              });
            }
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {!isEdit ? <NetSuiteOidcRedirectUriField /> : null}
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={nameFieldId}>
                Label
              </Label>
              <Input
                autoComplete="off"
                className={compactInputClass}
                defaultValue={account?.name ?? ""}
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
                defaultValue={account?.accountId ?? ""}
                id={accountIdFieldId}
                name="accountId"
                placeholder="1234567"
                readOnly={isEdit}
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
                placeholder={
                  isEdit ? "Leave blank to keep current client ID" : undefined
                }
                required={!isEdit}
                type="password"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-4 py-3">
            <Button
              className={cn(compactInputClass, "text-xs")}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <SubmitButton
              className={cn(compactInputClass, "text-xs")}
              isSuccessful={false}
            >
              {isEdit ? "Save" : "Add"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
