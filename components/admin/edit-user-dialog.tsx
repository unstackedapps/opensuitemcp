"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { adminSetUserNetSuiteMcpAccess } from "@/app/admin/netsuite/mcp/actions";
import { adminSetUserOidcAccess } from "@/app/admin/netsuite/oidc/actions";
import { adminSetUserPersonaAccess } from "@/app/admin/personas/actions";
import { adminSetUserLlmProviderAccess } from "@/app/admin/providers/actions";
import {
  adminDeleteUser,
  adminSetUserSignInMethod,
  adminSetUserStatus,
  adminSetUserTags,
  adminUpdateUserProfile,
} from "@/app/admin/users/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_DIALOG_TABS_LIST_CLASS,
  ADMIN_DIALOG_TABS_TRIGGER_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
  AdminDeleteButton,
} from "@/components/admin/admin-shell";
import {
  UserTagInput,
  type UserTagInputHandle,
} from "@/components/admin/user-tag-input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { providerTypeLabel } from "@/lib/ai/provider-entries";
import type { AdminOrgPersonaRow } from "@/lib/org/admin/personas";
import type { OrgUserTagRow } from "@/lib/org/admin/user-tags";
import type { OrgUserRow } from "@/lib/org/admin/users";
import type { OrgLlmProviderRow } from "@/lib/org/llm-providers";
import type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";
import type { OrgOidcAccountRow } from "@/lib/org/oidc-accounts";
import { cn } from "@/lib/utils";

const compactInputClass = ADMIN_SELECT_TRIGGER_CLASS;

export type EditUserTab = "profile" | "oidc" | "mcp" | "personas" | "providers";

type AccessItem = {
  id: string;
  label: string;
  detail?: string;
  locked?: boolean;
};

function displayProviderLabel(row: OrgLlmProviderRow): string {
  return row.modeConfig.label?.trim() || providerTypeLabel(row.providerType);
}

function UserAccessChecklist({
  emptyMessage,
  items,
  onChange,
  selectedIds,
}: {
  items: AccessItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-xs leading-relaxed">
        {emptyMessage}
      </p>
    );
  }

  const lockedIds = items.filter((item) => item.locked).map((item) => item.id);
  const selectableIds = items
    .filter((item) => !item.locked)
    .map((item) => item.id);

  const toggleItem = (id: string, locked?: boolean) => {
    if (locked) {
      return;
    }
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((value) => value !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className={cn(ADMIN_CONTROL_CLASS, "h-7 px-2 text-xs")}
          onClick={() =>
            onChange([...new Set([...lockedIds, ...selectableIds])])
          }
          type="button"
          variant="outline"
        >
          Select all
        </Button>
        <Button
          className={cn(ADMIN_CONTROL_CLASS, "h-7 px-2 text-xs")}
          onClick={() => onChange([...lockedIds])}
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
                item.locked ? "opacity-60" : "cursor-pointer hover:bg-muted/30",
                checked && "border-foreground/20 bg-muted/40",
              )}
              key={item.id}
            >
              <input
                checked={checked}
                className="mt-0.5 size-3.5 shrink-0 accent-foreground"
                disabled={item.locked}
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
  );
}

type EditUserDialogProps = {
  actorId: string;
  hasOidcLogin: boolean;
  initialTab?: EditUserTab;
  llmProviders: OrgLlmProviderRow[];
  netsuiteMcpAccounts: OrgNetSuiteMcpAccountRow[];
  oidcAccounts: OrgOidcAccountRow[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
  orgPersonas: AdminOrgPersonaRow[];
  orgTags: OrgUserTagRow[];
  user: OrgUserRow | null;
};

export function EditUserDialog({
  actorId,
  hasOidcLogin,
  initialTab = "profile",
  llmProviders,
  netsuiteMcpAccounts,
  oidcAccounts,
  onOpenChange,
  onSaved,
  open,
  orgPersonas,
  orgTags,
  user,
}: EditUserDialogProps) {
  const nameId = useId();
  const tagsId = useId();
  const tagInputRef = useRef<UserTagInputHandle>(null);
  const passwordId = useId();
  const signInBasicId = useId();
  const signInOidcId = useId();

  const [name, setName] = useState("");
  const [signInMethod, setSignInMethod] = useState<"basic" | "oidc">("oidc");
  const [password, setPassword] = useState("");
  const [oidcIds, setOidcIds] = useState<string[]>([]);
  const [mcpIds, setMcpIds] = useState<string[]>([]);
  const [personaIds, setPersonaIds] = useState<string[]>([]);
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [activeTab, setActiveTab] = useState<EditUserTab>(initialTab);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const tabs = useMemo(() => {
    const items: Array<{ id: EditUserTab; label: string }> = [
      { id: "profile", label: "Profile" },
    ];
    if (oidcAccounts.length > 0) {
      items.push({ id: "oidc", label: "OIDC" });
    }
    if (netsuiteMcpAccounts.length > 0) {
      items.push({ id: "mcp", label: "MCP" });
    }
    if (orgPersonas.length > 0) {
      items.push({ id: "personas", label: "Personas" });
    }
    if (llmProviders.length > 0) {
      items.push({ id: "providers", label: "Providers" });
    }
    return items;
  }, [llmProviders, netsuiteMcpAccounts, oidcAccounts, orgPersonas]);

  useEffect(() => {
    if (!open || !user) {
      return;
    }
    setName(user.name ?? "");
    setSignInMethod(user.hasPassword ? "basic" : "oidc");
    setPassword("");
    setOidcIds(user.oidcGrantIds);
    setMcpIds(user.netsuiteMcpGrantIds);
    setPersonaIds(user.personaGrantIds);
    setProviderIds(user.llmProviderGrantIds);
    setTags(user.tags);
    setStatus(user.status);
    setActiveTab(
      tabs.some((tab) => tab.id === initialTab) ? initialTab : "profile",
    );
    setDeleting(false);
    setSaving(false);
  }, [open, user, initialTab, tabs]);

  if (!user) {
    return null;
  }

  const currentMethod = user.hasPassword ? "basic" : "oidc";
  const isSelf = user.id === actorId;
  const passwordRequired =
    signInMethod === "basic" && (currentMethod === "oidc" || !user.hasPassword);

  const handleSave = async () => {
    setSaving(true);
    try {
      const profileResult = await adminUpdateUserProfile({
        userId: user.id,
        name: name.trim() || null,
      });
      if (!profileResult.ok) {
        toast({
          type: "error",
          description: profileResult.error ?? "Could not update profile.",
        });
        return;
      }

      if (status !== user.status) {
        const statusResult = await adminSetUserStatus({
          userId: user.id,
          status,
        });
        if (!statusResult.ok) {
          toast({
            type: "error",
            description: statusResult.error ?? "Could not update status.",
          });
          return;
        }
      }

      if (signInMethod === "oidc") {
        if (currentMethod !== "oidc") {
          const result = await adminSetUserSignInMethod({
            userId: user.id,
            signInMethod: "oidc",
          });
          if (!result.ok) {
            toast({
              type: "error",
              description: result.error ?? "Could not update sign-in.",
            });
            return;
          }
        }
      } else {
        const trimmed = password.trim();
        if (passwordRequired && trimmed.length < 6) {
          toast({
            type: "error",
            description: "Password must be at least 6 characters.",
          });
          return;
        }
        if (trimmed.length >= 6) {
          const result = await adminSetUserSignInMethod({
            userId: user.id,
            signInMethod: "basic",
            password: trimmed,
          });
          if (!result.ok) {
            toast({
              type: "error",
              description: result.error ?? "Could not update sign-in.",
            });
            return;
          }
        }
      }

      const tagsToSave = tagInputRef.current?.commitDraft() ?? tags;

      const tagsResult = await adminSetUserTags({
        userId: user.id,
        tags: tagsToSave,
      });
      if (!tagsResult.ok) {
        toast({
          type: "error",
          description: tagsResult.error ?? "Could not update tags.",
        });
        return;
      }

      if (oidcAccounts.length > 0) {
        const result = await adminSetUserOidcAccess({
          userId: user.id,
          orgOidcAccountIds: oidcIds,
        });
        if (!result.ok) {
          toast({
            type: "error",
            description: result.error ?? "Could not update OIDC access.",
          });
          return;
        }
      }

      if (netsuiteMcpAccounts.length > 0) {
        const result = await adminSetUserNetSuiteMcpAccess({
          userId: user.id,
          netsuiteMcpAccountIds: mcpIds,
        });
        if (!result.ok) {
          toast({
            type: "error",
            description: result.error ?? "Could not update MCP access.",
          });
          return;
        }
      }

      if (orgPersonas.length > 0) {
        const result = await adminSetUserPersonaAccess({
          userId: user.id,
          orgPersonaIds: personaIds,
        });
        if (!result.ok) {
          toast({
            type: "error",
            description: result.error ?? "Could not update persona access.",
          });
          return;
        }
      }

      if (llmProviders.length > 0) {
        const result = await adminSetUserLlmProviderAccess({
          userId: user.id,
          providerIds,
        });
        if (!result.ok) {
          toast({
            type: "error",
            description: result.error ?? "Could not update provider access.",
          });
          return;
        }
      }

      toast({ type: "success", description: "User updated." });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await adminDeleteUser({ userId: user.id });
    setDeleting(false);
    if (result.ok) {
      toast({ type: "success", description: "User deleted." });
      onSaved();
      return;
    }
    toast({
      type: "error",
      description: result.error ?? "Could not delete user.",
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-4 py-3 text-left">
          <DialogTitle className="text-base">Edit user</DialogTitle>
          <p className="text-muted-foreground text-xs">{user.email}</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <Tabs
            onValueChange={(value) => setActiveTab(value as EditUserTab)}
            value={activeTab}
          >
            <TabsList className={ADMIN_DIALOG_TABS_LIST_CLASS}>
              {tabs.map((tab) => (
                <TabsTrigger
                  className={ADMIN_DIALOG_TABS_TRIGGER_CLASS}
                  key={tab.id}
                  value={tab.id}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent className="mt-4 space-y-5" value="profile">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs" htmlFor={nameId}>
                    Name
                  </Label>
                  <Input
                    className={cn(compactInputClass, "max-w-sm")}
                    id={nameId}
                    maxLength={128}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Optional"
                    value={name}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs" htmlFor="user-status">
                    Status
                  </Label>
                  {isSelf ? (
                    <p className="text-muted-foreground text-xs">Active</p>
                  ) : (
                    <Select
                      onValueChange={(value) =>
                        setStatus(value as "active" | "disabled")
                      }
                      value={status}
                    >
                      <SelectTrigger
                        className={cn(compactInputClass, "max-w-sm")}
                        id="user-status"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <UserTagInput
                  id={tagsId}
                  onChange={setTags}
                  ref={tagInputRef}
                  suggestedTags={orgTags.map((tag) => tag.name)}
                  tags={tags}
                  variant="plain"
                />
              </div>

              {hasOidcLogin || signInMethod === "basic" ? (
                <div className="space-y-3 border-border/60 border-t pt-5">
                  {hasOidcLogin ? (
                    <fieldset className="space-y-2">
                      <legend className="text-xs">Sign-in method</legend>
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                        <label
                          className="flex items-center gap-2 text-sm"
                          htmlFor={signInOidcId}
                        >
                          <input
                            checked={signInMethod === "oidc"}
                            className="size-3.5 accent-foreground"
                            id={signInOidcId}
                            onChange={() => setSignInMethod("oidc")}
                            type="radio"
                          />
                          NetSuite OIDC
                        </label>
                        <label
                          className="flex items-center gap-2 text-sm"
                          htmlFor={signInBasicId}
                        >
                          <input
                            checked={signInMethod === "basic"}
                            className="size-3.5 accent-foreground"
                            id={signInBasicId}
                            onChange={() => setSignInMethod("basic")}
                            type="radio"
                          />
                          Email and password
                        </label>
                      </div>
                    </fieldset>
                  ) : null}

                  {signInMethod === "basic" ? (
                    <div className="space-y-2">
                      <Label className="text-xs" htmlFor={passwordId}>
                        {passwordRequired ? "Password" : "New password"}
                      </Label>
                      <Input
                        className={cn(compactInputClass, "max-w-sm")}
                        id={passwordId}
                        minLength={passwordRequired ? 6 : undefined}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={
                          passwordRequired ? undefined : "Leave blank to keep"
                        }
                        required={passwordRequired}
                        type="password"
                        value={password}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </TabsContent>

            {oidcAccounts.length > 0 ? (
              <TabsContent className="mt-4" value="oidc">
                <UserAccessChecklist
                  emptyMessage="No OIDC integrations configured."
                  items={oidcAccounts.map((account) => ({
                    id: account.id,
                    label: account.name,
                    detail: account.accountId,
                  }))}
                  onChange={setOidcIds}
                  selectedIds={oidcIds}
                />
              </TabsContent>
            ) : null}

            {netsuiteMcpAccounts.length > 0 ? (
              <TabsContent className="mt-4" value="mcp">
                <UserAccessChecklist
                  emptyMessage="No MCP connections configured."
                  items={netsuiteMcpAccounts.map((account) => ({
                    id: account.id,
                    label: account.name,
                    detail: account.accountId,
                  }))}
                  onChange={setMcpIds}
                  selectedIds={mcpIds}
                />
              </TabsContent>
            ) : null}

            {orgPersonas.length > 0 ? (
              <TabsContent className="mt-4" value="personas">
                <UserAccessChecklist
                  emptyMessage="No personas configured."
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
                  onChange={setPersonaIds}
                  selectedIds={personaIds}
                />
              </TabsContent>
            ) : null}

            {llmProviders.length > 0 ? (
              <TabsContent className="mt-4" value="providers">
                <UserAccessChecklist
                  emptyMessage="No LLM providers configured."
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
                  onChange={setProviderIds}
                  selectedIds={providerIds}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {isSelf ? (
            <p className="text-muted-foreground text-xs">
              You cannot delete your own account.
            </p>
          ) : (
            <AdminDeleteButton
              confirmLabel="Delete permanently"
              description="This action cannot be undone. This will permanently delete this user and all of their chats."
              disabled={deleting || saving}
              label="Delete user"
              onConfirm={handleDelete}
              title={`Delete ${user.email}?`}
            />
          )}
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Button
              className={ADMIN_CONTROL_CLASS}
              disabled={deleting || saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className={ADMIN_CONTROL_CLASS}
              disabled={deleting || saving}
              onClick={() => void handleSave()}
              type="button"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
