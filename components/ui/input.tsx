import * as React from "react";

import { controlResponsiveDefaults } from "@/lib/ui/control-defaults";
import { cn } from "@/lib/utils";

/**
 * The responsive defaults are applied only where the caller has said nothing
 * about that property. `md:px-3` beside a caller's `pl-9` used to win at every
 * width from 768px up, which put a search field's placeholder underneath its
 * own icon; `tailwind-merge` cannot resolve it, because an unprefixed class and
 * an `md:` one are different variant groups and both survive.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        className={cn(
          "flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-sm file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
          controlResponsiveDefaults(className),
          className,
        )}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
