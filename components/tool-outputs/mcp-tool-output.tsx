"use client";

import { useMemo } from "react";
import { CodeBlock } from "@/components/message-elements/code-block";
import { formatMcpToolOutput } from "@/lib/mcp/format-tool-display";

export function McpToolOutput({ output }: { output: unknown }) {
  const payloads = useMemo(() => formatMcpToolOutput(output), [output]);

  return (
    <div className="space-y-2">
      {payloads.map((payload) => (
        <CodeBlock
          code={payload.code}
          key={payload.id}
          language={payload.language}
        />
      ))}
    </div>
  );
}
