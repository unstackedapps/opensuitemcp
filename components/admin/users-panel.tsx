"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  adminCreateUser,
  adminDeleteUsers,
  adminSetUserRole,
} from "@/app/admin/users/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
  AdminPanel,
} from "@/components/admin/admin-shell";
import {
  EditUserDialog,
  type EditUserTab,
} from "@/components/admin/edit-user-dialog";
import { UsersBulkAccessDialog } from "@/components/admin/users-bulk-access-dialog";
import { UsersDataTable } from "@/components/admin/users-data-table";
import { UsersProvisionDialog } from "@/components/admin/users-provision-dialog";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgRole } from "@/lib/db/schema";
import type { AdminOrgPersonaRow } from "@/lib/org/admin/personas";
import type { OrgUserTagRow } from "@/lib/org/admin/user-tags";
import type { OrgUserRow } from "@/lib/org/admin/users";
import type { OrgLlmProviderRow } from "@/lib/org/llm-providers";
import type { OrgNetSuiteMcpAccountRow } from "@/lib/org/netsuite-mcp-accounts";
import type { OrgOidcAccountRow } from "@/lib/org/oidc-accounts";
import { isOrgOwnerRole } from "@/lib/org/types";
import { cn } from "@/lib/utils";

type UsersPanelEmbeddedHeader = {
  title: string;
  description: ReactNode;
};

type UsersPanelProps = {
  actorId: string;
  actorRole: OrgRole;
  oidcAccounts: OrgOidcAccountRow[];
  netsuiteMcpAccounts: OrgNetSuiteMcpAccountRow[];
  orgPersonas: AdminOrgPersonaRow[];
  orgTags: OrgUserTagRow[];
  llmProviders: OrgLlmProviderRow[];
  users: OrgUserRow[];
  embedded?: UsersPanelEmbeddedHeader;
};

const compactInputClass = ADMIN_SELECT_TRIGGER_CLASS;

export function UsersPanel({
  actorId,
  actorRole,
  oidcAccounts,
  netsuiteMcpAccounts,
  orgPersonas,
  orgTags,
  llmProviders,
  users,
  embedded,
}: UsersPanelProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<OrgUserRow | null>(null);
  const [editTab, setEditTab] = useState<EditUserTab>("profile");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [bulkAccessOpen, setBulkAccessOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const emailId = useId();
  const nameId = useId();
  const passwordId = useId();
  const roleId = useId();

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
    userId: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setPendingUserId(userId);
    const result = await action();
    setPendingUserId(null);
    notify(result, success);
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds].filter((id) => id !== actorId);
    if (ids.length === 0) {
      return;
    }
    const result = await adminDeleteUsers({ userIds: ids });
    if (!result.ok) {
      toast({
        type: "error",
        description: result.error ?? "Could not delete users.",
      });
      return;
    }
    toast({
      type: "success",
      description: `Deleted ${result.deleted} user(s).`,
    });
    if (result.errors.length > 0) {
      toast({
        type: "error",
        description: `${result.errors.length} delete error(s).`,
      });
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    router.refresh();
  };

  const bulkDeleteCount = [...selectedIds].filter(
    (id) => id !== actorId,
  ).length;

  const openEdit = (user: OrgUserRow, tab: EditUserTab = "profile") => {
    setEditUser(user);
    setEditTab(tab);
  };

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {selectedIds.size > 0 ? (
        <>
          <Button
            className={ADMIN_CONTROL_CLASS}
            onClick={() => setBulkAccessOpen(true)}
            type="button"
            variant="outline"
          >
            Access ({selectedIds.size})
          </Button>
          <Button
            className={ADMIN_CONTROL_CLASS}
            disabled={bulkDeleteCount === 0}
            onClick={() => {
              if (bulkDeleteCount === 0) {
                return;
              }
              setBulkDeleteOpen(true);
            }}
            type="button"
            variant="outline"
          >
            Delete ({bulkDeleteCount})
          </Button>
        </>
      ) : null}
      <Button
        className={ADMIN_CONTROL_CLASS}
        onClick={() => setProvisionOpen(true)}
        type="button"
        variant="outline"
      >
        Import / export
      </Button>
      <Button
        className={cn(ADMIN_CONTROL_CLASS, "shrink-0 text-sm")}
        onClick={() => setAddOpen(true)}
        type="button"
      >
        <Plus className="mr-1 size-3.5" />
        Add user
      </Button>
    </div>
  );

  const panelContent = (
    <>
      <UsersDataTable
        actorId={actorId}
        actorRole={actorRole}
        onEdit={openEdit}
        onRoleChange={(userId, role) =>
          run(userId, () => adminSetUserRole({ userId, role }), "Role updated.")
        }
        onSelectionChange={setSelectedIds}
        pendingUserId={pendingUserId}
        selectedIds={selectedIds}
        orgTags={orgTags}
        users={users}
      />

      <UsersProvisionDialog
        exportUsers={users}
        onOpenChange={setProvisionOpen}
        onSaved={() => {
          setProvisionOpen(false);
          router.refresh();
        }}
        open={provisionOpen}
      />

      <UsersBulkAccessDialog
        llmProviders={llmProviders}
        netsuiteMcpAccounts={netsuiteMcpAccounts}
        oidcAccounts={oidcAccounts}
        onOpenChange={setBulkAccessOpen}
        onSaved={() => {
          setBulkAccessOpen(false);
          setSelectedIds(new Set());
          router.refresh();
        }}
        open={bulkAccessOpen}
        orgPersonas={orgPersonas}
        selectedUserIds={[...selectedIds]}
      />

      <ConfirmDestructiveDialog
        actionClassName={ADMIN_CONTROL_CLASS}
        confirmLabel="Delete permanently"
        description="This action cannot be undone. This will permanently delete the selected users and all of their chats."
        onConfirm={handleBulkDelete}
        onOpenChange={setBulkDeleteOpen}
        open={bulkDeleteOpen}
        title={`Delete ${bulkDeleteCount} user${bulkDeleteCount === 1 ? "" : "s"}?`}
      />

      <EditUserDialog
        actorId={actorId}
        hasOidcLogin={oidcAccounts.length > 0}
        initialTab={editTab}
        llmProviders={llmProviders}
        netsuiteMcpAccounts={netsuiteMcpAccounts}
        oidcAccounts={oidcAccounts}
        onOpenChange={(open) => {
          if (!open) {
            setEditUser(null);
            setEditTab("profile");
          }
        }}
        onSaved={() => {
          setEditUser(null);
          setEditTab("profile");
          router.refresh();
        }}
        open={editUser !== null}
        orgPersonas={orgPersonas}
        orgTags={orgTags}
        user={editUser}
      />

      <AddUserDialog
        actorRole={actorRole}
        emailId={emailId}
        hasOidcLogin={oidcAccounts.length > 0}
        nameId={nameId}
        onOpenChange={setAddOpen}
        open={addOpen}
        passwordId={passwordId}
        roleId={roleId}
        onCreated={() => {
          setAddOpen(false);
          router.refresh();
        }}
      />
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-6">
        <OnboardingStepProse
          action={headerActions}
          description={embedded.description}
          title={embedded.title}
        />
        {panelContent}
      </div>
    );
  }

  return (
    <AdminPanel action={headerActions} title="Users">
      {panelContent}
    </AdminPanel>
  );
}

function AddUserDialog({
  actorRole,
  emailId,
  hasOidcLogin,
  nameId,
  open,
  onOpenChange,
  onCreated,
  passwordId,
  roleId,
}: {
  actorRole: OrgRole;
  emailId: string;
  hasOidcLogin: boolean;
  nameId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  passwordId: string;
  roleId: string;
}) {
  const [role, setRole] = useState<OrgRole>("member");
  const [signInMethod, setSignInMethod] = useState<"basic" | "oidc">(
    hasOidcLogin ? "oidc" : "basic",
  );
  const signInBasicId = useId();
  const signInOidcId = useId();
  const roles = isOrgOwnerRole(actorRole)
    ? ["member", "admin", "owner"]
    : ["member", "admin"];

  useEffect(() => {
    if (!open) {
      return;
    }
    setRole("member");
    setSignInMethod(hasOidcLogin ? "oidc" : "basic");
  }, [open, hasOidcLogin]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="text-base">Add user</DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const email = String(formData.get("email"));
            const nameValue = String(formData.get("name")).trim();
            const name = nameValue.length > 0 ? nameValue : null;
            const result =
              signInMethod === "oidc"
                ? await adminCreateUser({
                    signInMethod: "oidc",
                    email,
                    name,
                    role,
                  })
                : await adminCreateUser({
                    signInMethod: "basic",
                    email,
                    name,
                    password: String(formData.get("password")),
                    role,
                  });
            if (result.ok) {
              toast({ type: "success", description: "User created." });
              form.reset();
              onCreated();
              return;
            }
            toast({
              type: "error",
              description: result.error ?? "Could not create user.",
            });
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={emailId}>
                Email
              </Label>
              <Input
                autoComplete="email"
                className={compactInputClass}
                id={emailId}
                name="email"
                required
                type="email"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={nameId}>
                Name (optional)
              </Label>
              <Input
                className={compactInputClass}
                id={nameId}
                maxLength={128}
                name="name"
                type="text"
              />
            </div>
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
                      name="signInMethod"
                      onChange={() => setSignInMethod("oidc")}
                      type="radio"
                      value="oidc"
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
                      name="signInMethod"
                      onChange={() => setSignInMethod("basic")}
                      type="radio"
                      value="basic"
                    />
                    Email and password
                  </label>
                </div>
                <p className="text-muted-foreground text-xs">
                  {signInMethod === "oidc"
                    ? "OIDC email must match."
                    : "Email and password sign-in."}
                </p>
              </fieldset>
            ) : null}
            {signInMethod === "basic" ? (
              <div className="space-y-2">
                <Label className="text-xs" htmlFor={passwordId}>
                  Temporary password
                </Label>
                <Input
                  className={compactInputClass}
                  id={passwordId}
                  minLength={6}
                  name="password"
                  required
                  type="password"
                />
                <p className="text-muted-foreground text-xs">
                  Temporary until user changes it.
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="text-xs" htmlFor={roleId}>
                Role
              </Label>
              <Select
                onValueChange={(value) => setRole(value as OrgRole)}
                value={role}
              >
                <SelectTrigger className={compactInputClass} id={roleId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((roleOption) => (
                    <SelectItem key={roleOption} value={roleOption}>
                      {roleOption}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              Create
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
