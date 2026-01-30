"use client";

import { ExternalLinkIcon, SearchIcon } from "@/components/icons";
import type { WebSearchToolResult } from "@/lib/ai/web-search";
import { cn } from "@/lib/utils";

type WebSearchToolOutputProps = {
  result: WebSearchToolResult;
};

function getDisplayHostname(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname;
  } catch {
    return url;
  }
}

export function WebSearchToolOutput({ result }: WebSearchToolOutputProps) {
  const { query, results, domain, provider, metadata } = result;
  const siteFilter = metadata?.siteFilter;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        <span className="inline-flex h-5 items-center rounded-full border px-2 py-0.5 font-normal text-foreground text-xs normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          Locating Source URLs
        </span>
        <span className="flex items-center gap-1 text-muted-foreground normal-case">
          <SearchIcon size={14} />
          {provider} • {domain.label}
        </span>
      </div>

      <div className="space-y-1 text-xs">
        <span className="font-medium text-muted-foreground">Query</span>
        <div className="rounded-md border bg-muted/60 px-2 py-1 text-foreground">
          {query}
        </div>
        {siteFilter ? (
          <div className="text-muted-foreground">
            Filtered by{" "}
            <code className="rounded bg-muted px-1 py-0.5">{siteFilter}</code>
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Sources
        </span>
        {results.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No results found for the current filters.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {results.map((resultItem, index) => (
              <a
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  "text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                )}
                href={resultItem.url}
                key={resultItem.url ?? index}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLinkIcon aria-hidden="true" size={12} />
                <span className="max-w-[16ch] truncate">
                  {getDisplayHostname(resultItem.url)}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      {results.length > 0 ? (
        <ol className="space-y-3 text-sm">
          {results.map((resultItem, index) => (
            <li className="space-y-1" key={resultItem.url ?? index}>
              <div className="flex items-center gap-2">
                <a
                  className="font-medium text-primary text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  href={resultItem.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {resultItem.title}
                </a>
                {resultItem.engine ? (
                  <span className="inline-flex h-4 items-center rounded border px-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                    {resultItem.engine}
                  </span>
                ) : null}
              </div>
              {resultItem.snippet ? (
                <p className="text-muted-foreground text-sm">
                  {resultItem.snippet}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  No snippet provided by the search result.
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
