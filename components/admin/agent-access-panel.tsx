"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  adminSetAgentAccessMembers,
  adminSetAgentAccessPolicy,
} from "@/app/admin/agent-access/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SKILL_LIST_SCROLL_CLASS,
  AdminPanel,
} from "@/components/admin/admin-shell";
import { toast } from "@/components/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AdminAgentAccessState } from "@/lib/org/admin/agent-access";
import { cn } from "@/lib/utils";

type AgentAccessUser = {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
};

type AgentAccessPanelProps = {
  state: AdminAgentAccessState;
  users: AgentAccessUser[];
};

export function AgentAccessPanel({ state, users }: AgentAccessPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [allowed, setAllowed] = useState<Set<string>>(
    () => new Set(state.allowedUserIds),
  );

  const selectedMode = state.memberAccess === "selected";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return users;
    }
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(q) ||
        (user.name ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast({ type: "success", description: success });
        router.refresh();
      } else {
        toast({
          type: "error",
          description: result.error ?? "Could not save the change.",
        });
      }
    });
  };

  const toggleMember = (userId: string, next: boolean) => {
    const updated = new Set(allowed);
    if (next) {
      updated.add(userId);
    } else {
      updated.delete(userId);
    }
    setAllowed(updated);
    run(
      () => adminSetAgentAccessMembers({ userIds: [...updated] }),
      next ? "Member added." : "Member removed.",
    );
  };

  return (
    <div className="space-y-4">
      <AdminPanel title="Agent access">
        <p className="text-muted-foreground text-xs leading-relaxed">
          Lets a member connect an external AI agent to their own NetSuite
          workspace over MCP. The agent acts as that member, with their
          permissions and their tool policy — it never sees more than they do.
        </p>

        <div className="mt-4 space-y-4">
          <div className="flex items-start gap-3">
            <Switch
              checked={state.enabled}
              disabled={isPending}
              id="agent-access-enabled"
              onCheckedChange={(enabled) =>
                run(
                  () => adminSetAgentAccessPolicy({ enabled }),
                  enabled
                    ? "Agent access enabled."
                    : "Agent access disabled for the organization.",
                )
              }
            />
            <div className="space-y-0.5">
              <Label className="text-xs" htmlFor="agent-access-enabled">
                Enable for this organization
              </Label>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Off by default. While off, no member can mint a key and no
                existing key can connect.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              checked={selectedMode}
              disabled={isPending || !state.enabled}
              id="agent-access-selected"
              onCheckedChange={(selected) =>
                run(
                  () =>
                    adminSetAgentAccessPolicy({
                      memberAccess: selected ? "selected" : "all",
                    }),
                  selected
                    ? "Limited to selected members."
                    : "Open to every member.",
                )
              }
            />
            <div className="space-y-0.5">
              <Label className="text-xs" htmlFor="agent-access-selected">
                Limit to selected members
              </Label>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Off means every member of the organization may use it.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="agent-access-max-keys">
              Keys per member
            </Label>
            <Input
              className={cn(ADMIN_CONTROL_CLASS, "max-w-24")}
              defaultValue={state.maxKeysPerUser}
              disabled={isPending}
              id="agent-access-max-keys"
              max={100}
              min={1}
              onBlur={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                if (
                  !Number.isFinite(next) ||
                  next < 1 ||
                  next === state.maxKeysPerUser
                ) {
                  return;
                }
                run(
                  () => adminSetAgentAccessPolicy({ maxKeysPerUser: next }),
                  "Key limit updated.",
                );
              }}
              type="number"
            />
          </div>
        </div>
      </AdminPanel>

      {state.enabled && selectedMode ? (
        <AdminPanel title="Members with agent access">
          <Input
            className={cn(ADMIN_CONTROL_CLASS, "mb-3")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members"
            value={query}
          />
          <ul className={cn(ADMIN_SKILL_LIST_SCROLL_CLASS, "space-y-1")}>
            {filtered.map((user) => (
              <li
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                key={user.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{user.email}</p>
                  {user.name ? (
                    <p className="truncate text-muted-foreground text-xs">
                      {user.name}
                      {user.role ? ` · ${user.role}` : ""}
                    </p>
                  ) : null}
                </div>
                <Switch
                  checked={allowed.has(user.id)}
                  disabled={isPending}
                  onCheckedChange={(next) => toggleMember(user.id, next)}
                />
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-muted-foreground text-xs">
                No members match that search.
              </li>
            ) : null}
          </ul>
        </AdminPanel>
      ) : null}
    </div>
  );
}
