import "server-only";

import type { McpPrincipal } from "../authenticate";
import { loadNetSuitePassthroughTools } from "./netsuite-passthrough";
import { personaTools } from "./personas";
import { searchTools } from "./search";
import type { McpToolDefinition } from "./types";
import { workspaceTools } from "./workspace";

/**
 * The tool surface for one principal.
 *
 * What a key may reach is decided in the OpenSuiteMCP UI and nowhere else: a
 * NetSuite tool left enabled for the connection is listed and callable, and a
 * tool disabled there is neither. The server adds no second gate of its own —
 * read-vs-write is published as an advisory annotation so a client can prompt
 * before a mutation, never as a filter that hides a tool the user enabled.
 */
export async function buildToolSurface(
  principal: McpPrincipal,
): Promise<McpToolDefinition[]> {
  const netsuiteTools = await loadNetSuitePassthroughTools(principal);
  const all = [
    ...workspaceTools,
    ...personaTools,
    ...searchTools,
    ...netsuiteTools,
  ];

  // Deterministic order keeps prompt caches warm for the calling agent.
  return all.sort((left, right) => left.name.localeCompare(right.name));
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
