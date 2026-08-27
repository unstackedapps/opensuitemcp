"use client";

import { Pencil, Plug, Plus, Trash2, Unplug } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { LoaderIcon } from "@/components/icons";
import {
  type NetSuiteDcrProbeState,
  NetSuiteIntegrationSetupCard,
} from "@/components/netsuite-integration-setup-card";
import {
  formatMcpToolsAvailableLabel,
  NetSuiteMcpToolsSection,
  useNetSuiteMcpToolSummary,
} from "@/components/netsuite-mcp-tools-panel";
import { OnboardingPanelSkeleton } from "@/components/onboarding/onboarding-panel-skeleton";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import { NetSuiteMcpRedirectUriField } from "@/components/netsuite-mcp-redirect-uri-field";
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
import {
  formatNetSuiteAccountDisplay,
  type NetSuiteAccountEntry,
} from "@/lib/netsuite/accounts";
import { getDcrProbeForAccount } from "@/hooks/use-netsuite-dcr-probes";
import { cn } from "@/lib/utils";

export type { NetSuiteDcrProbeState } from "@/components/netsuite-integration-setup-card";

type NetSuiteConnectPanelEmbedded = {
  title: string;
  description: ReactNode;
};

type NetSuiteConnectPanelProps = {
  showSkeletons: boolean;
  accounts: NetSuiteAccountEntry[];
  selectedAccountId: string;
  editingLabels: Record<string, string>;
  newAccountId: string;
  newAccountLabel: string;
  dcrProbesByAccountId: Record<string, NetSuiteDcrProbeState>;
  connectedAccountIds?: string[];
  connectingAccountId?: string | null;
  onNewAccountIdChange: (value: string) => void;
  onNewAccountLabelChange: (value: string) => void;
  onAddAccount: () => void;
  onSelectAccount: (accountId: string) => void;
  onRenameAccount: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onEditingLabelChange: (accountId: string, value: string) => void;
  onProbe: (accountId: string) => void;
  onOpenIntegration: (accountId: string) => void;
  onConnect: (accountId: string) => void;
  onDisconnect: (accountId: string) => void;
  settingsActive: boolean;
  allowFreeAccountAdd?: boolean;
  lockedAccountIds?: string[];
  addableOrgAccounts?: NetSuiteAccountEntry[];
  onAddOrgAccount?: (account: NetSuiteAccountEntry) => void;
  prominentConnect?: boolean;
  embedded?: NetSuiteConnectPanelEmbedded;
};

const compactInputClass = "h-8 px-2.5 text-sm";

function shouldShowIntegrationSetup(
  dcrProbe: NetSuiteDcrProbeState,
): boolean {
  return (
    dcrProbe.status === "probing" ||
    dcrProbe.status === "needs_integration" ||
    dcrProbe.status === "error"
  );
}

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
      className="h-auto w-fit shrink-0 self-start justify-start px-1.5 py-0.5 text-left text-muted-foreground text-xs sm:self-center"
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

export function NetSuiteConnectPanel({
  showSkeletons,
  accounts,
  selectedAccountId,
  editingLabels,
  newAccountId,
  newAccountLabel,
  dcrProbesByAccountId,
  connectedAccountIds = [],
  connectingAccountId = null,
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
  allowFreeAccountAdd = true,
  lockedAccountIds = [],
  addableOrgAccounts = [],
  onAddOrgAccount,
  prominentConnect = false,
  embedded,
}: NetSuiteConnectPanelProps) {
  const accountIdFieldId = useId();
  const accountLabelFieldId = useId();
  const renameFieldId = useId();
  const [showAddForm, setShowAddForm] = useState(false);
  const [toolsOpenAccountId, setToolsOpenAccountId] = useState<string | null>(
    null,
  );
  const [renameAccountId, setRenameAccountId] = useState<string | null>(null);
  const [pendingDestructive, setPendingDestructive] = useState<{
    kind: "remove" | "disconnect";
    accountId: string;
    name: string;
  } | null>(null);

  const hasAccounts = accounts.length > 0;
  const lockedSet = new Set(lockedAccountIds);
  const canShowAdd = allowFreeAccountAdd || addableOrgAccounts.length > 0;

  const renameTarget = renameAccountId
    ? accounts.find((account) => account.accountId === renameAccountId)
    : undefined;
  const renameDraft =
    renameAccountId != null
      ? (editingLabels[renameAccountId] ?? renameTarget?.label ?? "")
      : "";

  let pendingTitle = "Confirm";
  if (pendingDestructive) {
    const action =
      pendingDestructive.kind === "disconnect" ? "Disconnect" : "Remove";
    pendingTitle = `${action} ${pendingDestructive.name}?`;
  }

  if (showSkeletons) {
    return <OnboardingPanelSkeleton />;
  }

  const addButton = canShowAdd ? (
    <Button
      className="w-full shrink-0 sm:w-auto"
      onClick={() => setShowAddForm(true)}
      size="sm"
      type="button"
      variant="outline"
    >
      <Plus className="size-4" />
      Add connection
    </Button>
  ) : null;

  const panelContent = (
    <div className="space-y-5">
      {!embedded && !hasAccounts ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-sm">
                Add one or more NetSuite connections
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {allowFreeAccountAdd
                  ? "Enter your NetSuite account ID to start this connection."
                  : "Your organization assigns MCP connections. Add one from the list below or contact an administrator."}
              </p>
            </div>
            {canShowAdd ? (
              addButton
            ) : (
              <p className="text-muted-foreground text-xs">
                No MCP connections are assigned to you yet.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {embedded && !hasAccounts ? (
        <p className="rounded-md border border-dashed p-3 text-center text-muted-foreground text-xs">
          {canShowAdd
            ? "No NetSuite connections yet."
            : "No MCP connections are assigned to you yet."}
        </p>
      ) : null}

      {hasAccounts ? (
        <div className="space-y-3">
          {!embedded ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-sm">Configured connections</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Choose the active connection for chat. Connect OAuth and
                  configure MCP tools per connection.
                </p>
              </div>
              {addButton}
            </div>
          ) : null}

          <ul className="space-y-2">
            {accounts.map((account) => {
              const isActive = account.accountId === selectedAccountId;
              const accountConnected = connectedAccountIds.includes(
                account.accountId,
              );
              const accountProbe = getDcrProbeForAccount(
                dcrProbesByAccountId,
                account.accountId,
              );
              const isConnectingAccount =
                connectingAccountId === account.accountId;
              const canConnectAccount =
                !accountConnected && accountProbe.status === "ready";
              const showIntegrationSetup =
                !accountConnected && shouldShowIntegrationSetup(accountProbe);
              const showProminentConnect =
                prominentConnect &&
                !accountConnected &&
                canConnectAccount &&
                !showIntegrationSetup;
              const toolsExpanded = toolsOpenAccountId === account.accountId;
              const radioId = `ns-account-${account.accountId}`;
              const displayName = formatNetSuiteAccountDisplay(account);
              const isLocked = lockedSet.has(account.accountId);

              return (
                <li
                  className="flex flex-col gap-3 rounded-md border border-border/60 p-3"
                  key={account.accountId}
                >
                  <div className="flex items-center gap-2 sm:gap-2.5">
                    <input
                      checked={isActive}
                      className="mt-1 size-3.5 shrink-0 self-start accent-foreground sm:mt-0 sm:self-center"
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
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
                      <label
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5"
                        htmlFor={radioId}
                      >
                        <span className="min-w-0 truncate font-medium text-sm">
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
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 self-center">
                      {!isLocked ? (
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
                      ) : null}
                      {accountConnected ? (
                        <Button
                          aria-label={`Disconnect ${displayName}`}
                          className="size-7 text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
                          onClick={() => {
                            setPendingDestructive({
                              accountId: account.accountId,
                              kind: "disconnect",
                              name: displayName,
                            });
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
                            isConnectingAccount
                              ? `Connecting ${displayName}`
                              : `Connect ${displayName}`
                          }
                          className="size-7 text-muted-foreground hover:text-foreground"
                          disabled={!canConnectAccount || isConnectingAccount}
                          onClick={() => {
                            onConnect(account.accountId);
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          {isConnectingAccount ? (
                            <span className="inline-block animate-spin">
                              <LoaderIcon size={14} />
                            </span>
                          ) : (
                            <Plug className="size-3.5" />
                          )}
                        </Button>
                      )}
                      {!isLocked ? (
                        <Button
                          aria-label={`Remove ${displayName}`}
                          className="size-7 text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
                          onClick={() => {
                            setPendingDestructive({
                              accountId: account.accountId,
                              kind: "remove",
                              name: displayName,
                            });
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {showIntegrationSetup ? (
                    <div className="border-border/60 border-t pt-3">
                      <NetSuiteIntegrationSetupCard
                        accountDisplay={displayName}
                        accountId={account.accountId}
                        dcrProbe={accountProbe}
                        onCancel={(accountId) => {
                          if (lockedSet.has(accountId)) {
                            return;
                          }
                          setPendingDestructive({
                            accountId,
                            kind: "remove",
                            name: formatNetSuiteAccountDisplay({
                              accountId,
                              label: accounts.find(
                                (entry) => entry.accountId === accountId,
                              )?.label,
                            }),
                          });
                        }}
                        onOpenIntegration={() => {
                          onOpenIntegration(account.accountId);
                        }}
                        onProbe={onProbe}
                      />
                    </div>
                  ) : null}

                  {showProminentConnect ? (
                    <div className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-4">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">
                          Connect with NetSuite
                        </p>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          Sign in with NetSuite OAuth to enable MCP tools for{" "}
                          {displayName}.
                        </p>
                      </div>
                      <Button
                        className="w-full sm:w-auto"
                        disabled={isConnectingAccount}
                        onClick={() => {
                          onConnect(account.accountId);
                        }}
                        type="button"
                      >
                        {isConnectingAccount ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block animate-spin">
                              <LoaderIcon size={14} />
                            </span>
                            Connecting…
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Plug className="size-4" />
                            Connect with NetSuite
                          </span>
                        )}
                      </Button>
                    </div>
                  ) : null}

                  {toolsExpanded ? (
                    <div className="border-border/60 border-t pt-3">
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
        </div>
      ) : null}

      <Dialog onOpenChange={setShowAddForm} open={showAddForm}>
        <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 space-y-1 border-border/60 border-b px-4 py-3 text-left sm:px-5">
            <DialogTitle className="text-base">
              {allowFreeAccountAdd
                ? "Add NetSuite connection"
                : "Add org connection"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {allowFreeAccountAdd
                ? "Enter the NetSuite account ID for this connection. Label is optional and shown in the switcher."
                : "Choose an organization MCP connection to add to your list."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
            <NetSuiteMcpRedirectUriField />
            {allowFreeAccountAdd ? (
              <AddAccountForm
                accountId={newAccountId}
                accountIdFieldId={accountIdFieldId}
                accountLabel={newAccountLabel}
                accountLabelFieldId={accountLabelFieldId}
                onAccountIdChange={onNewAccountIdChange}
                onAccountLabelChange={onNewAccountLabelChange}
                onSubmit={() => {
                  if (!newAccountId.trim()) {
                    return;
                  }
                  onAddAccount();
                  setShowAddForm(false);
                }}
              />
            ) : (
              <ul className="space-y-2">
                {addableOrgAccounts.map((account) => (
                  <li key={account.accountId}>
                    <Button
                      className="h-auto w-full justify-start px-3 py-2 text-left"
                      onClick={() => {
                        onAddOrgAccount?.(account);
                        setShowAddForm(false);
                      }}
                      type="button"
                      variant="outline"
                    >
                      <span className="font-medium text-sm">{account.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {account.accountId}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-border/60 border-t px-4 py-3 sm:justify-end sm:px-5">
            <Button
              onClick={() => setShowAddForm(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {allowFreeAccountAdd ? (
              <Button
                disabled={!newAccountId.trim()}
                onClick={() => {
                  onAddAccount();
                  setShowAddForm(false);
                }}
                size="sm"
                type="button"
              >
                Add connection
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogTitle className="text-base">Rename connection</DialogTitle>
            <DialogDescription className="text-xs">
              {renameAccountId
                ? `Nickname for ${renameAccountId}`
                : "Choose a nickname for this connection."}
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
      <ConfirmDestructiveDialog
        confirmLabel={
          pendingDestructive?.kind === "disconnect" ? "Disconnect" : "Remove"
        }
        description={
          pendingDestructive?.kind === "disconnect"
            ? "This revokes the OAuth connection. You can connect again later."
            : "This removes the connection from your list."
        }
        onConfirm={() => {
          if (!pendingDestructive) {
            return;
          }
          if (pendingDestructive.kind === "disconnect") {
            setToolsOpenAccountId((current) =>
              current === pendingDestructive.accountId ? null : current,
            );
            onDisconnect(pendingDestructive.accountId);
            return;
          }
          onRemoveAccount(pendingDestructive.accountId);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDestructive(null);
          }
        }}
        open={pendingDestructive !== null}
        title={pendingTitle}
      />
    </div>
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

function AddAccountForm({
  accountIdFieldId,
  accountLabelFieldId,
  accountId,
  accountLabel,
  onAccountIdChange,
  onAccountLabelChange,
  onSubmit,
}: {
  accountIdFieldId: string;
  accountLabelFieldId: string;
  accountId: string;
  accountLabel: string;
  onAccountIdChange: (value: string) => void;
  onAccountLabelChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && accountId.trim()) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={accountIdFieldId}>
          Account ID
        </Label>
        <Input
          autoComplete="off"
          className={compactInputClass}
          id={accountIdFieldId}
          onChange={(e) => onAccountIdChange(e.target.value)}
          onKeyDown={handleKeyDown}
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
          onKeyDown={handleKeyDown}
          placeholder="Sandbox"
          value={accountLabel}
        />
      </div>
    </div>
  );
}
