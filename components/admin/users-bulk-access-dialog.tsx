"use client";

import { useEffect, useMemo, useState } from "react";
import { adminBulkSetUserAccess } from "@/app/admin/users/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_DIALOG_TABS_LIST_CLASS,
  ADMIN_DIALOG_TABS_TRIGGER_CLASS,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { providerTypeLabel } from "@/lib/ai/provider-entries";
import type { AdminOrgPersonaRow } from "@/lib/org/admin/personas";
import type { OrgLlmProviderRow } from "@/lib/org/llm-providers";
import type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";
import type { OrgOidcAccountRow } from "@/lib/org/oidc-accounts";
import { cn } from "@/lib/utils";

function displayProviderLabel(row: OrgLlmProviderRow): string {
  return row.modeConfig.label?.trim() || providerTypeLabel(row.providerType);
}

type AccessItem = {
  id: string;
  label: string;
  detail?: string;
  locked?: boolean;
};

type BulkAccessSectionProps = {
  description: string;
  enabled: boolean;
  items: AccessItem[];
  onEnabledChange: (enabled: boolean) => void;
  onSelectedChange: (ids: string[]) => void;
  selectedIds: string[];
  title: string;
};

function BulkAccessSection({
  title,
  description,
  enabled,
  onEnabledChange,
  selectedIds,
  onSelectedChange,
  items,
}: BulkAccessSectionProps) {
  const lockedIds = items.filter((item) => item.locked).map((item) => item.id);
  const selectableIds = items
    .filter((item) => !item.locked)
    .map((item) => item.id);

  const toggleItem = (id: string, locked?: boolean) => {
    if (locked || !enabled) {
      return;
    }
    onSelectedChange(
      selectedIds.includes(id)
        ? selectedIds.filter((value) => value !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
        <div className="min-w-0 space-y-0.5">
          <Label className="font-medium text-sm" htmlFor={`${title}-toggle`}>
            {title}
          </Label>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        </div>
        <Switch
          checked={enabled}
          id={`${title}-toggle`}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className={cn(ADMIN_CONTROL_CLASS, "h-7 px-2 text-xs")}
              onClick={() =>
                onSelectedChange([...new Set([...lockedIds, ...selectableIds])])
              }
              type="button"
              variant="outline"
            >
              Select all
            </Button>
            <Button
              className={cn(ADMIN_CONTROL_CLASS, "h-7 px-2 text-xs")}
              onClick={() => onSelectedChange([...lockedIds])}
              type="button"
              variant="outline"
            >
              Clear
            </Button>
            <p className="text-muted-foreground text-[11px] sm:ml-auto">
              {selectedIds.length} of {items.length} selected
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((item) => {
              const checked = item.locked || selectedIds.includes(item.id);
              return (
                <label
                  className={cn(
                    "flex items-start gap-2 rounded-md border border-border/60 p-2.5 text-sm",
                    !enabled || item.locked
                      ? "opacity-60"
                      : "cursor-pointer hover:bg-muted/30",
                    checked && "border-foreground/20 bg-muted/40",
                  )}
                  key={item.id}
                >
                  <input
                    checked={checked}
                    className="mt-0.5 size-3.5 shrink-0 accent-foreground"
                    disabled={!enabled || item.locked}
                    onChange={() => toggleItem(item.id, item.locked)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-xs leading-snug">
                      {item.label}
                    </span>
                    {item.detail ? (
                      <span className="mt-0.5 block text-muted-foreground text-[11px] leading-relaxed">
                        {item.detail}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Turn on to replace this access type for all selected users.
        </p>
      )}
    </div>
  );
}

type UsersBulkAccessDialogProps = {
  llmProviders: OrgLlmProviderRow[];
  netsuiteMcpAccounts: OrgNetSuiteMcpAccountRow[];
  oidcAccounts: OrgOidcAccountRow[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
  orgPersonas: AdminOrgPersonaRow[];
  selectedUserIds: string[];
};

export function UsersBulkAccessDialog({
  llmProviders,
  netsuiteMcpAccounts,
  oidcAccounts,
  onOpenChange,
  onSaved,
  open,
  orgPersonas,
  selectedUserIds,
}: UsersBulkAccessDialogProps) {
  const [oidcIds, setOidcIds] = useState<string[]>([]);
  const [mcpIds, setMcpIds] = useState<string[]>([]);
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [touchOidc, setTouchOidc] = useState(false);
  const [touchMcp, setTouchMcp] = useState(false);
  const [touchPersonas, setTouchPersonas] = useState(false);
  const [touchProviders, setTouchProviders] = useState(false);
  const [saving, setSaving] = useState(false);

  const sections = useMemo(() => {
    const available: Array<{
      id: "oidc" | "mcp" | "personas" | "providers";
      label: string;
    }> = [];
    if (oidcAccounts.length > 0) {
      available.push({ id: "oidc", label: "OIDC" });
    }
    if (netsuiteMcpAccounts.length > 0) {
      available.push({ id: "mcp", label: "MCP" });
    }
    if (orgPersonas.length > 0) {
      available.push({ id: "personas", label: "Personas" });
    }
    if (llmProviders.length > 0) {
      available.push({ id: "providers", label: "Providers" });
    }
    return available;
  }, [llmProviders, netsuiteMcpAccounts, oidcAccounts, orgPersonas]);

  const [activeTab, setActiveTab] = useState<
    "oidc" | "mcp" | "personas" | "providers"
  >(sections[0]?.id ?? "oidc");

  useEffect(() => {
    if (!open) {
      return;
    }
    setOidcIds([]);
    setMcpIds([]);
    setPersonaIds([]);
    setProviderIds([]);
    setTouchOidc(false);
    setTouchMcp(false);
    setTouchPersonas(false);
    setTouchProviders(false);
    setSaving(false);
    setActiveTab(sections[0]?.id ?? "oidc");
  }, [open, sections]);

  const enabledSectionCount = [
    touchOidc,
    touchMcp,
    touchPersonas,
    touchProviders,
  ].filter(Boolean).length;

  const handleSave = async () => {
    if (enabledSectionCount === 0) {
      toast({
        type: "error",
        description: "Enable at least one access type to update.",
      });
      return;
    }

    setSaving(true);
    const result = await adminBulkSetUserAccess({
      userIds: selectedUserIds,
      oidcAccountIds: touchOidc ? oidcIds : undefined,
      netsuiteMcpAccountIds: touchMcp ? mcpIds : undefined,
      orgPersonaIds: touchPersonas ? personaIds : undefined,
      providerIds: touchProviders ? providerIds : undefined,
    });
    setSaving(false);

    if (!result.ok) {
      toast({
        type: "error",
        description: result.error ?? "Could not update access.",
      });
      return;
    }

    toast({
      type: "success",
      description: `Updated ${result.updated} user(s).`,
    });

    if (result.errors.length > 0) {
      toast({
        type: "error",
        description: `${result.errors.length} user error(s).`,
      });
    }

    onSaved();
  };

  if (sections.length === 0) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-4 py-3 text-left">
          <DialogTitle className="text-base">Bulk access</DialogTitle>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Update {selectedUserIds.length} selected user
            {selectedUserIds.length === 1 ? "" : "s"}. For each enabled access
            type, checked items become the user&apos;s full grant list for that
            type.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <Tabs
            onValueChange={(value) =>
              setActiveTab(value as "oidc" | "mcp" | "personas" | "providers")
            }
            value={activeTab}
          >
            <TabsList className={ADMIN_DIALOG_TABS_LIST_CLASS}>
              {sections.map((section) => (
                <TabsTrigger
                  className={ADMIN_DIALOG_TABS_TRIGGER_CLASS}
                  key={section.id}
                  value={section.id}
                >
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {oidcAccounts.length > 0 ? (
              <TabsContent className="mt-4" value="oidc">
                <BulkAccessSection
                  description="NetSuite OIDC integrations these users may sign in with."
                  enabled={touchOidc}
                  items={oidcAccounts.map((account) => ({
                    id: account.id,
                    label: account.name,
                    detail: account.accountId,
                  }))}
                  onEnabledChange={setTouchOidc}
                  onSelectedChange={setOidcIds}
                  selectedIds={oidcIds}
                  title="OIDC sign-in"
                />
              </TabsContent>
            ) : null}

            {netsuiteMcpAccounts.length > 0 ? (
              <TabsContent className="mt-4" value="mcp">
                <BulkAccessSection
                  description="NetSuite MCP connections these users may use in chat."
                  enabled={touchMcp}
                  items={netsuiteMcpAccounts.map((account) => ({
                    id: account.id,
                    label: account.name,
                    detail: account.accountId,
                  }))}
                  onEnabledChange={setTouchMcp}
                  onSelectedChange={setMcpIds}
                  selectedIds={mcpIds}
                  title="NetSuite MCP"
                />
              </TabsContent>
            ) : null}

            {orgPersonas.length > 0 ? (
              <TabsContent className="mt-4" value="personas">
                <BulkAccessSection
                  description="Personas available to these users."
                  enabled={touchPersonas}
                  items={orgPersonas.map((persona) => ({
                    id: persona.id,
                    label: persona.name,
                    detail: [
                      persona.shortName,
                      !persona.enabled ? "disabled org-wide" : null,
                      persona.alwaysOn ? "always on" : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    locked: persona.alwaysOn,
                  }))}
                  onEnabledChange={setTouchPersonas}
                  onSelectedChange={setPersonaIds}
                  selectedIds={personaIds}
                  title="Personas"
                />
              </TabsContent>
            ) : null}

            {llmProviders.length > 0 ? (
              <TabsContent className="mt-4" value="providers">
                <BulkAccessSection
                  description="Org LLM providers these users may use."
                  enabled={touchProviders}
                  items={llmProviders.map((provider) => ({
                    id: provider.id,
                    label: displayProviderLabel(provider),
                    detail: [
                      providerTypeLabel(provider.providerType),
                      !provider.enabled ? "disabled org-wide" : null,
                      !provider.hasOrgApiKey ? "no API key" : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                  onEnabledChange={setTouchProviders}
                  onSelectedChange={setProviderIds}
                  selectedIds={providerIds}
                  title="LLM providers"
                />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            {enabledSectionCount === 0
              ? "No access types selected"
              : `${enabledSectionCount} access type${enabledSectionCount === 1 ? "" : "s"} will update`}
          </p>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Button
              className={ADMIN_CONTROL_CLASS}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className={ADMIN_CONTROL_CLASS}
              disabled={saving || enabledSectionCount === 0}
              onClick={() => void handleSave()}
              type="button"
            >
              {saving ? "Applying…" : "Apply to selected"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
