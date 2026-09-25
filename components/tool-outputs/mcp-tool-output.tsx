"use client";

import { Columns2Icon } from "lucide-react";
import { useMemo } from "react";
import { useCanvas } from "@/components/canvas/context";
import { CodeBlock } from "@/components/message-elements/code-block";
import { Button } from "@/components/ui/button";
import { formatMcpToolOutput } from "@/lib/mcp/format-tool-display";

/**
 * Below this a result is readable where it sits, and a button to move it
 * somewhere roomier is noise. A NetSuite ledger is never this short.
 */
const CANVAS_WORTH_LINES = 12;

export function McpToolOutput({
  output,
  toolName,
}: {
  output: unknown;
  toolName?: string;
}) {
  const payloads = useMemo(() => formatMcpToolOutput(output), [output]);
  const { openCanvas, isOpenFor, available } = useCanvas();

  return (
    <div className="space-y-2">
      {payloads.map((payload) => {
        const id = `${toolName ?? "tool"}:${payload.id}`;
        const worthCanvas =
          available && payload.code.split("\n").length >= CANVAS_WORTH_LINES;

        return (
          <div className="group relative" key={payload.id}>
            {worthCanvas ? (
              <Button
                // Desktop only, like the panel it opens.
                className="absolute top-1.5 right-1.5 z-10 hidden opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 md:inline-flex"
                onClick={() =>
                  openCanvas({
                    id,
                    title: toolName ?? "Tool result",
                    code: payload.code,
                    language: payload.language,
                  })
                }
                size="sm"
                title={isOpenFor(id) ? "Close canvas" : "Open in canvas"}
                variant="secondary"
              >
                <Columns2Icon className="size-3.5" />
                <span className="ml-1 text-xs">
                  {isOpenFor(id) ? "Close" : "Canvas"}
                </span>
              </Button>
            ) : null}
            <CodeBlock code={payload.code} language={payload.language} />
          </div>
        );
      })}
    </div>
  );
}
