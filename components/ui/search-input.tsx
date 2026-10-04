"use client";

import { Search } from "lucide-react";
import { type ComponentProps, type ElementRef, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A text field with a magnifier in it.
 *
 * The padding that clears the icon is declared once here, so no call site has
 * to work it out. `Input` stands its responsive default aside when a caller
 * sets padding, so one unprefixed class is enough.
 */
export const SearchInput = forwardRef<
  ElementRef<typeof Input>,
  ComponentProps<typeof Input> & {
    /** The tighter geometry a sidebar needs, where a full-width field is wrong. */
    compact?: boolean;
  }
>(({ className, compact = false, ...props }, ref) => {
  return (
    <div className="relative min-w-0">
      <Search
        className={cn(
          "-translate-y-1/2 pointer-events-none absolute top-1/2 text-muted-foreground",
          compact ? "left-2 size-3.5" : "left-2.5 size-4",
        )}
      />
      <Input
        className={cn(compact ? "pl-7" : "pl-9", className)}
        ref={ref}
        type="search"
        {...props}
      />
    </div>
  );
});
SearchInput.displayName = "SearchInput";
