"use client";

import { BrainIcon, ClockIcon, GlobeIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import type { GetCurrentConfigToolResult } from "@/lib/ai/tools/get-current-config";
import { cn } from "@/lib/utils";

type GetCurrentConfigToolOutputProps = {
  result: GetCurrentConfigToolResult;
};

const PROVIDER_LABELS: Record<"google" | "anthropic" | "openai", string> = {
  google: "Google (Gemini)",
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
};

export function GetCurrentConfigToolOutput({
  result,
}: GetCurrentConfigToolOutputProps) {
  const { model, configuration } = result;
  const isGoogle = configuration.provider === "google";
  const isAnthropic = configuration.provider === "anthropic";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        <span className="inline-flex h-5 items-center gap-1 rounded-full border px-2 py-0.5 font-normal text-foreground text-xs normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <BrainIcon size={14} />
          Current Configuration
        </span>
      </div>

      {/* Model Information */}
      <div className="rounded-lg border border-primary bg-primary/5 p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">AI Model</h3>
            <Badge
              variant={isGoogle ? "default" : "secondary"}
              className={cn(
                isAnthropic &&
                  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
                configuration.provider === "openai" &&
                  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
              )}
            >
              {PROVIDER_LABELS[configuration.provider]}
            </Badge>
          </div>
          <div className="space-y-2">
            <div>
              <p className="font-medium text-sm">{model.name}</p>
              <p className="text-muted-foreground text-xs">
                {model.description}
              </p>
            </div>
            {model.selectedId !== model.resolvedId && (
              <div className="rounded border border-dashed bg-muted/30 p-2 text-xs">
                <p className="text-muted-foreground">
                  <span className="font-medium">Selected:</span>{" "}
                  {model.selectedId}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium">Resolved:</span>{" "}
                  {model.resolvedId}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Configuration Details */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
          <span>Settings</span>
        </div>

        <div className="rounded-lg border p-3">
          <div className="space-y-2">
            {/* Timezone */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClockIcon size={14} />
                <span className="text-sm">Timezone</span>
              </div>
              <Badge variant="outline">{configuration.timezone}</Badge>
            </div>

            {/* Enabled Search Domains */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <GlobeIcon size={14} />
                <span className="text-sm">Search Domains</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                {configuration.enabledSearchDomains.length === 0 ? (
                  <Badge variant="secondary" className="text-xs">
                    None enabled
                  </Badge>
                ) : (
                  <div className="flex flex-wrap justify-end gap-1">
                    {configuration.enabledSearchDomains.map((domain) => (
                      <Badge key={domain} variant="outline" className="text-xs">
                        {domain}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
