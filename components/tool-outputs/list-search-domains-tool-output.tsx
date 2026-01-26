"use client";

import { GlobeIcon, ToggleOffIcon, ToggleOnIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import type { ListSearchDomainsToolResult } from "@/lib/ai/tools/list-search-domains";
import { cn } from "@/lib/utils";

type ListSearchDomainsToolOutputProps = {
  result: ListSearchDomainsToolResult;
};

const STATUS_LABELS: Record<string, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  unavailable: "Unavailable",
  "coming-soon": "Coming Soon",
};

export function ListSearchDomainsToolOutput({
  result,
}: ListSearchDomainsToolOutputProps) {
  const { domains } = result;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        <span className="inline-flex h-5 items-center gap-1 rounded-full border px-2 py-0.5 font-normal text-foreground text-xs normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <GlobeIcon size={14} />
          Available Search Domains
        </span>
      </div>

      <div className="space-y-2">
        {domains.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No domains are configured for web search.
          </p>
        ) : (
          domains.map((domain) => {
            const statusLabel =
              STATUS_LABELS[domain.status] ?? domain.status ?? "Unknown";
            const isEnabled = domain.enabled;

            return (
              <div
                className={cn(
                  "rounded-lg border p-3 text-sm transition-colors",
                  isEnabled
                    ? "border-primary bg-primary/5"
                    : "border-dashed hover:bg-muted/40",
                )}
                key={domain.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">
                        {domain.label}
                      </span>
                      <Badge variant="outline">{domain.tier}</Badge>
                      <Badge
                        className={cn(
                          "capitalize",
                          isEnabled
                            ? "border-primary text-primary"
                            : "text-muted-foreground",
                        )}
                        variant="secondary"
                      >
                        {statusLabel}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {domain.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    {isEnabled ? (
                      <span className="text-primary">
                        <ToggleOnIcon size={16} />
                      </span>
                    ) : (
                      <ToggleOffIcon size={16} />
                    )}
                    <span>{isEnabled ? "Selected" : "Not selected"}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <a
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-foreground text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    href={domain.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {domain.url}
                  </a>
                  <Badge variant="secondary">{domain.provider}</Badge>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
