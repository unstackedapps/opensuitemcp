"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { ADMIN_CONTROL_CLASS } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  USER_PROVISION_IMPORT_COLUMNS,
  type UserProvisionCatalogColumn,
} from "@/lib/org/user-provision-catalog";
import { cn } from "@/lib/utils";

function CatalogColumnList({
  columns,
}: {
  columns: UserProvisionCatalogColumn[];
}) {
  return (
    <ul className="space-y-2">
      {columns.map((column) => (
        <li
          className="rounded-md border border-border/60 bg-muted/20 px-3 py-2"
          key={column.key}
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-[11px]">{column.label}</code>
            {column.required ? (
              <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 font-medium text-[10px] text-foreground uppercase tracking-wide">
                Required
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-muted-foreground text-[11px] leading-relaxed">
            {column.description}
          </p>
          {column.example ? (
            <p className="mt-1 text-muted-foreground text-[11px]">
              Example: <code className="text-[11px]">{column.example}</code>
            </p>
          ) : null}
          {column.allowedValues && column.allowedValues.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-[11px]">
              {column.allowedValues.map((entry) => (
                <li className="text-muted-foreground" key={entry.value}>
                  <code>{entry.value}</code>
                  {entry.label ? ` — ${entry.label}` : null}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function UserProvisionCatalogControls() {
  const [referenceOpen, setReferenceOpen] = useState(false);

  return (
    <Collapsible onOpenChange={setReferenceOpen} open={referenceOpen}>
      <CollapsibleTrigger asChild>
        <Button
          className={cn(
            ADMIN_CONTROL_CLASS,
            "h-auto w-full justify-between px-3 py-2 text-left text-xs",
          )}
          type="button"
          variant="outline"
        >
          <span>Column reference</span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              referenceOpen && "rotate-180",
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <CatalogColumnList columns={USER_PROVISION_IMPORT_COLUMNS} />
      </CollapsibleContent>
    </Collapsible>
  );
}
