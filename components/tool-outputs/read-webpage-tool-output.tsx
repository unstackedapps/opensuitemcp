"use client";

import { ExternalLinkIcon } from "@/components/icons";
import type { ReadWebpageToolResult } from "@/lib/ai/tools/read-webpage";
import { cn } from "@/lib/utils";

type ReadWebpageToolOutputProps = {
  result: ReadWebpageToolResult;
};

export function ReadWebpageToolOutput({ result }: ReadWebpageToolOutputProps) {
  const { url, title, content, error, fetchedAt } = result;

  if (error) {
    return (
      <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
        <div className="font-medium text-destructive text-sm">Error</div>
        <p className="text-destructive text-sm">{error}</p>
        <a
          className="inline-flex items-center gap-1 text-primary text-sm underline-offset-4 hover:underline"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLinkIcon aria-hidden="true" size={12} />
          {url}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <a
          className="font-medium text-primary text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {title}
        </a>
        <span className="text-muted-foreground">
          <ExternalLinkIcon aria-hidden="true" size={14} />
        </span>
      </div>
      <div className="text-muted-foreground text-xs">
        <a
          className="underline-offset-4 hover:underline"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {url}
        </a>
      </div>
      {content ? (
        <div className="space-y-2">
          <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Content
          </div>
          <div
            className={cn(
              "max-h-96 overflow-y-auto rounded-md border bg-muted/50 p-3 text-sm",
              "prose prose-sm dark:prose-invert max-w-none",
            )}
          >
            <p className="whitespace-pre-wrap">{content}</p>
          </div>
        </div>
      ) : null}
      <div className="text-muted-foreground text-xs">
        Fetched at: {new Date(fetchedAt).toLocaleString()}
      </div>
    </div>
  );
}
