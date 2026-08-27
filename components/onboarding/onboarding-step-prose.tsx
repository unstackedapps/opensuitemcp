import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type OnboardingStepProseProps = {
  title: string;
  description: ReactNode;
  titleAccessory?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
};

export function OnboardingStepProse({
  title,
  description,
  titleAccessory,
  action,
  children,
}: OnboardingStepProseProps) {
  return (
    <header className="space-y-2 border-border/60 border-b pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 items-start gap-2">
            <h1 className="min-w-0 font-semibold text-base leading-snug md:text-lg">
              {title}
            </h1>
            {titleAccessory}
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </header>
  );
}

type OnboardingStepListItem = {
  label: string;
  detail?: string;
  required?: boolean;
  optional?: boolean;
};

type OnboardingStepListProps = {
  title?: string;
  items: OnboardingStepListItem[];
};

export function OnboardingStepList({ title, items }: OnboardingStepListProps) {
  return (
    <div className="space-y-3">
      {title ? (
        <h2 className="font-medium text-foreground text-sm">{title}</h2>
      ) : null}
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li
            className="flex gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5"
            key={item.label}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm leading-snug">
                  {item.label}
                </span>
                {item.required ? (
                  <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 font-medium text-[10px] text-foreground uppercase tracking-wide">
                    Required
                  </span>
                ) : null}
                {item.optional ? (
                  <span className="rounded-full border border-border/80 px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                    Optional
                  </span>
                ) : null}
              </div>
              {item.detail ? (
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {item.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

type OnboardingCalloutProps = {
  children: ReactNode;
  variant?: "info" | "tip";
};

export function OnboardingCallout({
  children,
  variant = "info",
}: OnboardingCalloutProps) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5 text-xs leading-relaxed",
        variant === "tip"
          ? "border-border/60 bg-muted/40 text-muted-foreground"
          : "border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-100",
      )}
    >
      {children}
    </div>
  );
}
