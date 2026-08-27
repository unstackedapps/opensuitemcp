"use client";

import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthBrand } from "@/components/auth-brand";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { Button } from "@/components/ui/button";
import type { OrgRole } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/** Scrollable skill list body — parent must be a bounded flex column. */
export const ADMIN_SKILL_LIST_SCROLL_CLASS =
  "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto";

/** Shared compact control height for admin panels (overrides default md:h-10 on selects). */
export const ADMIN_CONTROL_CLASS =
  "h-8 min-h-8 px-2.5 py-1 text-xs md:h-8 md:py-1";

export const ADMIN_SELECT_TRIGGER_CLASS = cn(ADMIN_CONTROL_CLASS, "text-sm");

/** Full-width tab bar for admin dialogs (edit user, bulk access, etc.). */
export const ADMIN_DIALOG_TABS_LIST_CLASS = "flex h-8 w-full p-0.5";

export const ADMIN_DIALOG_TABS_TRIGGER_CLASS =
  "h-7 min-w-0 flex-1 px-1 text-xs sm:px-2 sm:text-sm";

const ADMIN_LAYOUT_MAX_CLASS = "max-w-7xl";

export function AdminDeleteButton({
  label,
  disabled,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  label: string;
  disabled?: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={label}
        className={cn(
          ADMIN_CONTROL_CLASS,
          "px-2 text-destructive hover:text-destructive",
        )}
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDestructiveDialog
        actionClassName={ADMIN_CONTROL_CLASS}
        confirmLabel={confirmLabel}
        description={description}
        onConfirm={onConfirm}
        onOpenChange={setOpen}
        open={open}
        title={title}
      />
    </>
  );
}

export function AdminEditButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className={cn(ADMIN_CONTROL_CLASS, "px-2")}
      disabled={disabled}
      onClick={onClick}
      type="button"
      variant="outline"
    >
      <Pencil className="size-3.5" />
    </Button>
  );
}

function isAdminNavActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) {
    return true;
  }
  if (href === "/admin/users" && pathname === "/admin") {
    return true;
  }
  if (href === "/admin/netsuite/mcp" && pathname === "/admin/netsuite") {
    return true;
  }
  if (href === "/admin/skills/oracle" && pathname === "/admin/skills") {
    return true;
  }
  return false;
}

const ADMIN_NAV = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/providers", label: "LLM Providers" },
  { href: "/admin/search", label: "Web Search" },
  { href: "/admin/netsuite", label: "NetSuite" },
  { href: "/admin/skills", label: "Skills" },
  { href: "/admin/personas", label: "Personas" },
] as const;

export function AdminShell({
  role,
  children,
}: {
  role: OrgRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-border/60 border-b px-4 py-3 md:px-6">
        <div
          className={cn(
            "mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
            ADMIN_LAYOUT_MAX_CLASS,
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <AuthBrand className="justify-start" />
            <p className="text-muted-foreground text-xs">Organization admin</p>
          </div>
          <Link
            className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
            href="/"
          >
            <ArrowLeft className="size-4 shrink-0" />
            Back to app
          </Link>
        </div>
      </header>

      <div
        className={cn(
          "mx-auto flex min-h-0 w-full flex-1 flex-col gap-4 px-4 py-4 md:px-6 md:py-6",
          ADMIN_LAYOUT_MAX_CLASS,
        )}
      >
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-border/60 border-b pb-3 md:pb-4">
          {ADMIN_NAV.map((item) => (
            <Link
              className={cn(
                "shrink-0 rounded-md px-3 py-2 text-sm transition-colors",
                isAdminNavActive(pathname, item.href)
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>

      {role === "admin" ? (
        <p
          className={cn(
            "mx-auto shrink-0 px-4 pb-4 text-muted-foreground text-xs md:px-6",
            ADMIN_LAYOUT_MAX_CLASS,
          )}
        >
          Only owners can assign the owner role.
        </p>
      ) : null}
    </div>
  );
}

export function AdminSubnav({
  tabs,
}: {
  tabs: ReadonlyArray<{ href: string; label: string }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-border/60 border-b pb-3">
      {tabs.map((item) => {
        const active =
          pathname === item.href ||
          pathname.startsWith(`${item.href}/`) ||
          (item.href === "/admin/netsuite/mcp" &&
            pathname === "/admin/netsuite") ||
          (item.href === "/admin/skills/oracle" &&
            pathname === "/admin/skills");

        return (
          <Link
            className={cn(
              "shrink-0 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminPanel({
  title,
  titleAccessory,
  children,
  action,
  className,
  fillViewport = false,
}: {
  title?: string;
  titleAccessory?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Lock panel body height so only internal scroll regions move (skills, personas). */
  fillViewport?: boolean;
}) {
  const showHeader = Boolean(title ?? titleAccessory ?? action);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col gap-4 rounded-md border border-border/60 p-4 md:p-6",
        className,
      )}
    >
      {showHeader ? (
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {title ? <h2 className="font-medium text-base">{title}</h2> : null}
            {titleAccessory}
          </div>
          {action}
        </div>
      ) : null}
      {fillViewport ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function AdminPlaceholderPanel({
  description,
  title,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-md border border-border/60 p-4 md:p-6">
      <h2 className="font-medium text-base">{title}</h2>
      <p className="mt-2 text-muted-foreground text-sm">{description}</p>
    </section>
  );
}
