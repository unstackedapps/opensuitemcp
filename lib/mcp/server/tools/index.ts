import "server-only";

import type { McpPrincipal } from "../authenticate";
import { loadNetSuitePassthroughTools } from "./netsuite-passthrough";
import type { McpToolDefinition } from "./types";
import { workspaceTools } from "./workspace";

/**
 * The tool surface for one principal.
 *
 * The list is authorization-dependent by design: a read-only key never sees a
 * mutating tool, so a caller cannot discover a capability it may not use.
 */
export async function buildToolSurface(
  principal: McpPrincipal,
): Promise<McpToolDefinition[]> {
  const netsuiteTools = await loadNetSuitePassthroughTools(principal);
  const all = [...workspaceTools, ...netsuiteTools];

  const permitted = all.filter((tool) =>
    principal.scopes.includes(tool.requiredScope),
  );

  // Deterministic order keeps prompt caches warm for the calling agent.
  return permitted.sort((left, right) => left.name.localeCompare(right.name));
}

export async function findTool(
  principal: McpPrincipal,
  name: string,
): Promise<McpToolDefinition | null> {
  const tools = await buildToolSurface(principal);
  return tools.find((tool) => tool.name === name) ?? null;
}

/** Wire shape for `tools/list`. */
export function toWireTool(tool: McpToolDefinition) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  };
}

export type { McpToolDefinition } from "./types";
