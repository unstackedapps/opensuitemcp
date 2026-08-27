"use client";

import { useMemo, useState } from "react";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
  AdminEditButton,
} from "@/components/admin/admin-shell";
import type { EditUserTab } from "@/components/admin/edit-user-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgRole } from "@/lib/db/schema";
import type { OrgUserTagRow } from "@/lib/org/admin/user-tags";
import type { OrgUserRow } from "@/lib/org/admin/users";
import { isOrgOwnerRole } from "@/lib/org/types";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100, 250] as const;

type PageSize = (typeof PAGE_SIZES)[number];

type SortKey =
  | "email"
  | "name"
  | "role"
  | "status"
  | "lastLoginAt"
  | "createdAt";

type SortDir = "asc" | "desc";

type FilterPreset =
  | "all"
  | "active"
  | "disabled"
  | "owner"
  | "admin"
  | "member"
  | "oidc"
  | "basic"
  | "temp_password";

function formatWhen(value: Date | string | null): string {
  if (!value) {
    return "—";
  }
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString();
}

function roleOptions(actorRole: OrgRole, targetRole: OrgRole): OrgRole[] {
  if (isOrgOwnerRole(actorRole)) {
    return ["owner", "admin", "member"];
  }
  if (targetRole === "owner") {
    return ["owner"];
  }
  return ["admin", "member"];
}

function compareUsers(
  a: OrgUserRow,
  b: OrgUserRow,
  key: SortKey,
  dir: SortDir,
): number {
  const factor = dir === "asc" ? 1 : -1;

  if (key === "email") {
    return factor * a.email.localeCompare(b.email);
  }
  if (key === "name") {
    return factor * (a.name ?? "").localeCompare(b.name ?? "");
  }
  if (key === "role") {
    return factor * a.role.localeCompare(b.role);
  }
  if (key === "status") {
    return factor * a.status.localeCompare(b.status);
  }
  if (key === "lastLoginAt") {
    const aTime = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
    const bTime = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
    return factor * (aTime - bTime);
  }
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  return factor * (aTime - bTime);
}

function matchesPreset(row: OrgUserRow, preset: FilterPreset): boolean {
  switch (preset) {
    case "all":
      return true;
    case "active":
      return row.status === "active";
    case "disabled":
      return row.status === "disabled";
    case "owner":
      return row.role === "owner";
    case "admin":
      return row.role === "admin";
    case "member":
      return row.role === "member";
    case "oidc":
      return !row.hasPassword;
    case "basic":
      return row.hasPassword;
    case "temp_password":
      return row.mustResetPassword;
    default:
      return true;
  }
}

function matchesQuery(row: OrgUserRow, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    row.email.toLowerCase().includes(normalized) ||
    (row.name?.toLowerCase().includes(normalized) ?? false) ||
    row.tags.some((tag) => tag.toLowerCase().includes(normalized))
  );
}

function matchesTag(row: OrgUserRow, tagFilter: string): boolean {
  if (tagFilter === "all") {
    return true;
  }
  if (tagFilter === "untagged") {
    return row.tags.length === 0;
  }
  return row.tags.some((tag) => tag.toLowerCase() === tagFilter.toLowerCase());
}

type UsersDataTableProps = {
  actorId: string;
  actorRole: OrgRole;
  pendingUserId: string | null;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  orgTags: OrgUserTagRow[];
  users: OrgUserRow[];
  onEdit: (user: OrgUserRow, tab?: EditUserTab) => void;
  onRoleChange: (userId: string, role: OrgRole) => void;
};

export function UsersDataTable({
  actorId,
  actorRole,
  pendingUserId,
  selectedIds,
  onSelectionChange,
  orgTags,
  users,
  onEdit,
  onRoleChange,
}: UsersDataTableProps) {
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<FilterPreset>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("email");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(0);

  const filterTags = useMemo(() => {
    const names = new Map<string, number>();
    for (const tag of orgTags) {
      names.set(tag.name, tag.userCount);
    }
    for (const row of users) {
      for (const tag of row.tags) {
        if (!names.has(tag)) {
          names.set(tag, 0);
        }
      }
    }
    return [...names.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, userCount]) => ({ name, userCount }));
  }, [orgTags, users]);

  const filtered = useMemo(() => {
    const rows = users.filter(
      (row) =>
        matchesQuery(row, query) &&
        matchesPreset(row, preset) &&
        matchesTag(row, tagFilter),
    );
    rows.sort((a, b) => compareUsers(a, b, sortKey, sortDir));
    return rows;
  }, [users, query, preset, tagFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  const pageIds = pageRows.map((row) => row.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) {
      return "";
    }
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  const togglePage = () => {
    const next = new Set(selectedIds);
    if (allPageSelected) {
      for (const id of pageIds) {
        next.delete(id);
      }
    } else {
      for (const id of pageIds) {
        next.add(id);
      }
    }
    onSelectionChange(next);
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          className={cn(ADMIN_SELECT_TRIGGER_CLASS, "w-full sm:max-w-xs")}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          placeholder="Search email or name"
          type="search"
          value={query}
        />
        <Select
          onValueChange={(value) => {
            setPreset(value as FilterPreset);
            setPage(0);
          }}
          value={preset}
        >
          <SelectTrigger
            className={cn(ADMIN_SELECT_TRIGGER_CLASS, "w-full sm:w-40")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="owner">Owners</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="member">Members</SelectItem>
            <SelectItem value="oidc">NetSuite OIDC</SelectItem>
            <SelectItem value="basic">Email & password</SelectItem>
            <SelectItem value="temp_password">Temp password</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => {
            setTagFilter(value);
            setPage(0);
          }}
          value={tagFilter}
        >
          <SelectTrigger
            className={cn(ADMIN_SELECT_TRIGGER_CLASS, "w-full sm:w-40")}
          >
            <SelectValue placeholder="All tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            <SelectItem value="untagged">Untagged</SelectItem>
            {filterTags.map((tag) => (
              <SelectItem key={tag.name} value={tag.name}>
                {tag.userCount > 0
                  ? `${tag.name} (${tag.userCount})`
                  : tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => {
            setPageSize(Number(value) as PageSize);
            setPage(0);
          }}
          value={String(pageSize)}
        >
          <SelectTrigger
            className={cn(ADMIN_SELECT_TRIGGER_CLASS, "w-full sm:w-28")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs sm:ml-auto">
          {filtered.length} user{filtered.length === 1 ? "" : "s"}
          {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : null}
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border/60">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border/60 bg-muted/40 text-xs">
            <tr>
              <th className="w-8 p-2">
                <input
                  aria-label="Select all on page"
                  checked={allPageSelected}
                  className="size-3.5 accent-foreground"
                  onChange={togglePage}
                  type="checkbox"
                />
              </th>
              <th className="p-2">
                <button
                  className="font-medium hover:underline"
                  onClick={() => toggleSort("email")}
                  type="button"
                >
                  Email{sortIndicator("email")}
                </button>
              </th>
              <th className="p-2">
                <button
                  className="font-medium hover:underline"
                  onClick={() => toggleSort("name")}
                  type="button"
                >
                  Name{sortIndicator("name")}
                </button>
              </th>
              <th className="p-2">
                <button
                  className="font-medium hover:underline"
                  onClick={() => toggleSort("role")}
                  type="button"
                >
                  Role{sortIndicator("role")}
                </button>
              </th>
              <th className="p-2">
                <button
                  className="font-medium hover:underline"
                  onClick={() => toggleSort("status")}
                  type="button"
                >
                  Status{sortIndicator("status")}
                </button>
              </th>
              <th className="p-2">
                <button
                  className="font-medium hover:underline"
                  onClick={() => toggleSort("lastLoginAt")}
                  type="button"
                >
                  Last login{sortIndicator("lastLoginAt")}
                </button>
              </th>
              <th className="p-2">
                <button
                  className="font-medium hover:underline"
                  onClick={() => toggleSort("createdAt")}
                  type="button"
                >
                  Joined{sortIndicator("createdAt")}
                </button>
              </th>
              <th className="p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground p-4 text-center text-xs"
                  colSpan={8}
                >
                  No users match your filters.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const isSelf = row.id === actorId;
                const canEditRole =
                  isOrgOwnerRole(actorRole) || row.role !== "owner";
                const options = roleOptions(actorRole, row.role);
                const busy = pendingUserId === row.id;

                return (
                  <tr
                    className="border-b border-border/40 last:border-b-0"
                    key={row.id}
                  >
                    <td className="p-2">
                      <input
                        aria-label={`Select ${row.email}`}
                        checked={selectedIds.has(row.id)}
                        className="size-3.5 accent-foreground"
                        onChange={() => toggleRow(row.id)}
                        type="checkbox"
                      />
                    </td>
                    <td className="min-w-0 p-2">
                      <p className="truncate font-medium text-xs">
                        {row.email}
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                        {!row.hasPassword ? (
                          <span className="text-muted-foreground">OIDC</span>
                        ) : (
                          <span className="text-muted-foreground">Basic</span>
                        )}
                        {row.mustResetPassword ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            Temp pwd
                          </span>
                        ) : null}
                        {row.tags.map((tag) => (
                          <Badge
                            className="px-1 py-0 font-normal text-[10px]"
                            key={tag}
                            variant="outline"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="min-w-0 p-2 text-xs">
                      {row.name?.trim() || "—"}
                    </td>
                    <td className="p-2">
                      <Select
                        disabled={!canEditRole || busy || isSelf}
                        onValueChange={(role) =>
                          onRoleChange(row.id, role as OrgRole)
                        }
                        value={row.role}
                      >
                        <SelectTrigger
                          className={cn(
                            ADMIN_SELECT_TRIGGER_CLASS,
                            "w-24 text-xs",
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-xs">
                      {row.status === "disabled" ? (
                        <span className="text-destructive">Disabled</span>
                      ) : (
                        <span className="text-muted-foreground">Active</span>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {formatWhen(row.lastLoginAt)}
                    </td>
                    <td className="p-2 text-xs">{formatWhen(row.createdAt)}</td>
                    <td className="p-2">
                      <AdminEditButton
                        disabled={busy}
                        label={`Edit ${row.email}`}
                        onClick={() => onEdit(row)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Page {safePage + 1} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            className={ADMIN_CONTROL_CLASS}
            disabled={safePage <= 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            type="button"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            className={ADMIN_CONTROL_CLASS}
            disabled={safePage >= totalPages - 1}
            onClick={() =>
              setPage((current) => Math.min(totalPages - 1, current + 1))
            }
            type="button"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export type { FilterPreset, SortKey };
export { formatWhen, PAGE_SIZES };
