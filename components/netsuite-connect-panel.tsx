"use client";

import { Pencil, Plug, Plus, Trash2, Unplug } from "lucide-react";
import { useId, useState } from "react";
import { LoaderIcon, WarningIcon } from "@/components/icons";
import { NetSuiteIntegrationChecklist } from "@/components/netsuite-integration-checklist";
import {
  formatMcpToolsAvailableLabel,
  NetSuiteMcpToolsSection,
  useNetSuiteMcpToolSummary,
} from "@/components/netsuite-mcp-tools-panel";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatNetSuiteAccountDisplay,
  type NetSuiteAccountEntry,
} from "@/lib/netsuite/accounts";
import { cn } from "@/lib/utils";

export type NetSuiteDcrProbeState =
  | { status: "idle" }
  | { status: "probing" }
  | { status: "ready"; clientId: string }
  | {
      status: "needs_integration";
      accountId: string;
      integrationUrl: string;
      redirectUri: string;
      dcrClientName: string;
      checklist: string[];
    }
  | { status: "error"; error: string };

type NetSuiteConnectPanelProps = {
  showSkeletons: boolean;
  accounts: NetSuiteAccountEntry[];
  selectedAccountId: string;
  editingLabels: Record<string, string>;
  newAccountId: string;
  newAccountLabel: string;
  dcrProbe: NetSuiteDcrProbeState;
  isConnected: boolean;
  connectedAccountIds?: string[];
  isConnecting: boolean;
  canConnect: boolean;
  onNewAccountIdChange: (value: string) => void;
  onNewAccountLabelChange: (value: string) => void;
  onAddAccount: () => void;
  onSelectAccount: (accountId: string) => void;
  onRenameAccount: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onEditingLabelChange: (accountId: string, value: string) => void;
  onProbe: (accountId: string) => void;
  onOpenIntegration: () => void;
  onConnect: () => void;
  onDisconnect: (accountId: string) => void;
  settingsActive: boolean;
};

const compactInputClass = "h-8 px-2.5 text-sm";

function AccountMcpToolsToggle({
  accountId,
  enabled,
  expanded,
  onToggle,
}: {
  accountId: string;
  enabled: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { total, isLoading } = useNetSuiteMcpToolSummary(accountId, enabled);
  if (!enabled) {
    return null;
  }
  if (isLoading && total == null) {
    return (
      <span className="text-muted-foreground text-xs">Loading tools…</span>
    );
  }
  if (total == null) {
    return null;
  }
  return (
    <Button
      aria-expanded={expanded}
      className="h-auto px-1.5 py-0.5 text-muted-foreground text-xs"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      size="sm"
      type="button"
      variant="ghost"
    >
      {formatMcpToolsAvailableLabel(total)}
    </Button>
  );
}

function IntegrationSetupCard({
  accountDisplay,
  accountId,
  dcrProbe,
  redirectUri,
  clientName,
  onProbe,
  onOpenIntegration,
  onCancel,
}: {
  accountDisplay: string;
  accountId: string;
  dcrProbe: NetSuiteDcrProbeState;
  redirectUri: string;
  clientName?: string;
  onProbe: (accountId: string) => void;
  onOpenIntegration: () => void;
  onCancel: (accountId: string) => void;
}) {
  if (dcrProbe.status === "probing") {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-xs">
        <span className="inline-block animate-spin">
          <LoaderIcon size={14} />
        </span>
        Checking Integration record…
      </p>
    );
  }

  if (dcrProbe.status === "error") {
    return (
      <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 dark:border-yellow-400/20 dark:bg-yellow-400/5">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400/70">
            <WarningIcon size={14} />
          </div>
          <div className="flex-1 space-y-2">
            <p className="font-medium text-sm text-yellow-900 dark:text-yellow-200">
              Could not verify Integration
            </p>
            <p className="text-xs text-yellow-800 dark:text-yellow-200/80">
              {dcrProbe.error}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => onProbe(accountId)}
                size="sm"
                type="button"
                variant="outline"
              >
                Check again
              </Button>
              <Button
                disabled={!accountId}
                onClick={() => onCancel(accountId)}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (dcrProbe.status !== "needs_integration") {
    return null;
  }

  return (
    <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 dark:border-yellow-400/20 dark:bg-yellow-400/5">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400/70">
          <WarningIcon size={14} />
        </div>
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-sm text-yellow-900 dark:text-yellow-200">
              Create the Integration record
            </p>
            <p className="text-xs text-yellow-800 dark:text-yellow-200/80">
              Account{" "}
              <span className="font-medium">{accountDisplay}</span>. A NetSuite
              administrator needs to create this once per account, then you can
              connect.
            </p>
          </div>
          <NetSuiteIntegrationChecklist
            clientName={clientName}
            redirectUri={redirectUri}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={onOpenIntegration}
              size="sm"
              type="button"
              variant="outline"
            >
              Open New Integration
            </Button>
            <Button
              disabled={!accountId}
              onClick={() => onProbe(accountId)}
              size="sm"
              type="button"
              variant="outline"
            >
              Check again
            </Button>
            <Button
              disabled={!accountId}
              onClick={() => onCancel(accountId)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NetSuiteConnectPanel({
  showSkeletons,
  accounts,
  selectedAccountId,
  editingLabels,
  newAccountId,
  newAccountLabel,
  dcrProbe,
  isConnected,
  connectedAccountIds = [],
  isConnecting,
  canConnect,
  onNewAccountIdChange,
  onNewAccountLabelChange,
  onAddAccount,
  onSelectAccount,
  onRenameAccount,
  onRemoveAccount,
  onEditingLabelChange,
  onProbe,
  onOpenIntegration,
  onConnect,
  onDisconnect,
  settingsActive,
}: NetSuiteConnectPanelProps) {
  const accountIdFieldId = useId();
  const accountLabelFieldId = useId();
  const renameFieldId = useId();
  const [showAddForm, setShowAddForm] = useState(false);
  const [toolsOpenAccountId, setToolsOpenAccountId] = useState<string | null>(
    null,
  );
  const [renameAccountId, setRenameAccountId] = useState<string | null>(null);

  const hasAccounts = accounts.length > 0;
  const showIntegrationSetup =
    hasAccounts &&
    !isConnected &&
    (dcrProbe.status === "probing" ||
      dcrProbe.status === "needs_integration" ||
      dcrProbe.status === "error");
  const redirectUri =
    dcrProbe.status === "needs_integration"
      ? dcrProbe.redirectUri
      : typeof window !== "undefined"
        ? `${window.location.origin}/api/netsuite/callback`
        : "/api/netsuite/callback";
  const clientName =
    dcrProbe.status === "needs_integration"
      ? dcrProbe.dcrClientName
      : undefined;

  const renameTarget = renameAccountId
    ? accounts.find((account) => account.accountId === renameAccountId)
    : undefined;
  const renameDraft =
    renameAccountId != null
      ? (editingLabels[renameAccountId] ?? renameTarget?.label ?? "")
      : "";
  const selectedAccount = accounts.find(
    (account) => account.accountId === selectedAccountId,
  );
  const selectedAccountDisplay = selectedAccountId
    ? formatNetSuiteAccountDisplay({
        accountId: selectedAccountId,
        label: selectedAccount?.label,
      })
    : "";

  if (showSkeletons && !hasAccounts) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!hasAccounts ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-sm">Add a NetSuite account</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Enter your NetSuite account ID to start. An administrator will
              create the Integration record next, then you can connect with
              OAuth.
            </p>
          </div>
          <AddAccountForm
            accountId={newAccountId}
            accountIdFieldId={accountIdFieldId}
            accountLabel={newAccountLabel}
            accountLabelFieldId={accountLabelFieldId}
            onAccountIdChange={onNewAccountIdChange}
            onAccountLabelChange={onNewAccountLabelChange}
            onSubmit={onAddAccount}
            submitLabel="Add account"
          />
        </div>
      ) : null}

      {hasAccounts ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium text-sm">Configured accounts</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Choose the active account for chat. Connect OAuth and configure
                MCP tools per account.
              </p>
            </div>
            <Button
              onClick={() => setShowAddForm(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus className="size-4" />
              Add Account
            </Button>
          </div>

          <div className="space-y-2">
            <ul className="divide-y divide-border/60 rounded-md border border-border/60">
              {accounts.map((account) => {
                const isActive = account.accountId === selectedAccountId;
                const accountConnected = connectedAccountIds.includes(
                  account.accountId,
                );
                const toolsExpanded = toolsOpenAccountId === account.accountId;
                const radioId = `ns-account-${account.accountId}`;
                const displayName = formatNetSuiteAccountDisplay(account);
                return (
                  <li className="px-2.5 py-2" key={account.accountId}>
                    <div className="flex items-center gap-2.5">
                      <input
                        checked={isActive}
                        className="size-3.5 shrink-0 accent-foreground"
                        id={radioId}
                        name="netsuite-active-account"
                        onChange={() => {
                          if (!isActive) {
                            onSelectAccount(account.accountId);
                          }
                        }}
                        type="radio"
                        value={account.accountId}
                      />
                      <label
                        className="min-w-0 flex-1 cursor-pointer"
                        htmlFor={radioId}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium text-sm">
                            {displayName}
                          </span>
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-medium text-[10px] leading-none",
                              accountConnected
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                                : "border-border/80 bg-muted/50 text-muted-foreground",
                            )}
                          >
                            {accountConnected ? "Connected" : "Not connected"}
                          </span>
                        </div>
                      </label>
                      <AccountMcpToolsToggle
                        accountId={account.accountId}
                        enabled={accountConnected && settingsActive}
                        expanded={toolsExpanded}
                        onToggle={() => {
                          setToolsOpenAccountId((current) =>
                            current === account.accountId
                              ? null
                              : account.accountId,
                          );
                        }}
                      />
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          aria-label={`Rename ${displayName}`}
                          className="size-7"
                          onClick={() => {
                            onEditingLabelChange(
                              account.accountId,
                              account.label,
                            );
                            setRenameAccountId(account.accountId);
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        {accountConnected ? (
                          <Button
                            aria-label={`Disconnect ${displayName}`}
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setToolsOpenAccountId((current) =>
                                current === account.accountId ? null : current,
                              );
                              onDisconnect(account.accountId);
                            }}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Unplug className="size-3.5" />
                          </Button>
                        ) : (
                          <Button
                            aria-label={
                              isConnecting && isActive
                                ? `Connecting ${displayName}`
                                : `Connect ${displayName}`
                            }
                            className="size-7 text-muted-foreground hover:text-foreground"
                            disabled={
                              isActive && (!canConnect || isConnecting)
                            }
                            onClick={() => {
                              if (!isActive) {
                                onSelectAccount(account.accountId);
                                return;
                              }
                              onConnect();
                            }}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            {isConnecting && isActive ? (
                              <span className="inline-block animate-spin">
                                <LoaderIcon size={14} />
                              </span>
                            ) : (
                              <Plug className="size-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          aria-label={`Remove ${displayName}`}
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveAccount(account.accountId)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    {toolsExpanded ? (
                      <div className="mt-2 border-border/60 border-t pt-2 pl-6">
                        <NetSuiteMcpToolsSection
                          accountId={account.accountId}
                          accountLabel={account.label}
                          active={settingsActive}
                          connected={accountConnected}
                          nested
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {showAddForm ? (
              <div className="space-y-2 rounded-md border border-border/60 p-2.5">
                <AddAccountForm
                  accountId={newAccountId}
                  accountIdFieldId={`${accountIdFieldId}-another`}
                  accountLabel={newAccountLabel}
                  accountLabelFieldId={`${accountLabelFieldId}-another`}
                  onAccountIdChange={onNewAccountIdChange}
                  onAccountLabelChange={onNewAccountLabelChange}
                  onSubmit={() => {
                    onAddAccount();
                    setShowAddForm(false);
                  }}
                  submitLabel="Add"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => setShowAddForm(false)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showIntegrationSetup ? (
        <IntegrationSetupCard
          accountDisplay={selectedAccountDisplay}
          accountId={selectedAccountId}
          clientName={clientName}
          dcrProbe={dcrProbe}
          onCancel={onRemoveAccount}
          onOpenIntegration={onOpenIntegration}
          onProbe={onProbe}
          redirectUri={redirectUri}
        />
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setRenameAccountId(null);
          }
        }}
        open={renameAccountId != null}
      >
        <DialogContent className="max-w-sm gap-4 p-4 sm:max-w-sm">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base">Rename account</DialogTitle>
            <DialogDescription className="text-xs">
              {renameAccountId
                ? `Nickname for ${renameAccountId}`
                : "Choose a nickname for this account."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={renameFieldId}>
              Nickname
            </Label>
            <Input
              autoComplete="off"
              autoFocus
              className={compactInputClass}
              id={renameFieldId}
              onChange={(e) => {
                if (renameAccountId) {
                  onEditingLabelChange(renameAccountId, e.target.value);
                }
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  renameAccountId &&
                  renameDraft.trim()
                ) {
                  e.preventDefault();
                  onRenameAccount(renameAccountId);
                  setRenameAccountId(null);
                }
              }}
              placeholder="Sandbox"
              value={renameDraft}
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              onClick={() => setRenameAccountId(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={!renameAccountId || !renameDraft.trim()}
              onClick={() => {
                if (!renameAccountId) {
                  return;
                }
                onRenameAccount(renameAccountId);
                setRenameAccountId(null);
              }}
              size="sm"
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddAccountForm({
  accountIdFieldId,
  accountLabelFieldId,
  accountId,
  accountLabel,
  onAccountIdChange,
  onAccountLabelChange,
  onSubmit,
  submitLabel,
}: {
  accountIdFieldId: string;
  accountLabelFieldId: string;
  accountId: string;
  accountLabel: string;
  onAccountIdChange: (value: string) => void;
  onAccountLabelChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={accountIdFieldId}>
          Account ID
        </Label>
        <Input
          autoComplete="off"
          className={compactInputClass}
          id={accountIdFieldId}
          onChange={(e) => onAccountIdChange(e.target.value)}
          placeholder="1234567-sb1"
          value={accountId}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={accountLabelFieldId}>
          Label (optional)
        </Label>
        <Input
          autoComplete="off"
          className={compactInputClass}
          id={accountLabelFieldId}
          onChange={(e) => onAccountLabelChange(e.target.value)}
          placeholder="Sandbox"
          value={accountLabel}
        />
      </div>
      <div className="flex items-end">
        <Button
          disabled={!accountId.trim()}
          onClick={onSubmit}
          size="sm"
          type="button"
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
