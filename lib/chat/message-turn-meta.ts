import { isMcpToolEmptyResult } from "@/lib/mcp/tool-empty";
import { getMcpToolError } from "@/lib/mcp/tool-error";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";

export function getMessageTurnUsage(
  message: Pick<ChatMessage, "parts">,
): AppUsage | undefined {
  for (const part of [...(message.parts ?? [])].reverse()) {
    if (part.type === "data-usage") {
      return part.data;
    }
  }
}

export function getMessageTurnDurationMs(
  message: Pick<ChatMessage, "parts" | "metadata">,
  startedAtIso?: string,
): number | undefined {
  for (const part of [...(message.parts ?? [])].reverse()) {
    if (part.type !== "data-turnDuration") {
      continue;
    }
    const durationMs = part.data?.durationMs;
    if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
      return Math.max(0, durationMs);
    }
  }

  const endedAt = message.metadata?.createdAt;
  if (!endedAt || !startedAtIso) {
    return;
  }
  const ms = new Date(endedAt).getTime() - new Date(startedAtIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return;
  }
  return ms;
}

export function formatTurnTokenCount(
  usage:
    | {
        totalTokens?: number;
        inputTokens?: number;
        outputTokens?: number;
      }
    | undefined,
): string | null {
  if (!usage) {
    return null;
  }
  const total =
    usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }
  return `${total.toLocaleString("en-US")} tokens`;
}

function formatLabeledCount(
  count: number,
  singular: string,
  plural: string,
): string | null {
  if (count <= 0) {
    return null;
  }
  if (count === 1) {
    return `1 ${singular}`;
  }
  return `${count.toLocaleString("en-US")} ${plural}`;
}

export type McpToolOutcomeCounts = {
  total: number;
  succeeded: number;
  failed: number;
  empty: number;
};

type ToolPartOutcome = {
  state?: string;
  output?: unknown;
  errorText?: string;
};

function isToolPartFailed(part: ToolPartOutcome): boolean {
  if (part.state === "output-error") {
    return true;
  }
  if (typeof part.errorText === "string" && part.errorText.trim().length > 0) {
    return true;
  }
  return Boolean(getMcpToolError(part.output));
}

function isToolPartEmpty(part: ToolPartOutcome): boolean {
  if (isToolPartFailed(part) || part.state !== "output-available") {
    return false;
  }
  return isMcpToolEmptyResult(part.output);
}

export function countMcpToolOutcomes(
  parts: Array<{
    type?: string;
    state?: string;
    output?: unknown;
    errorText?: string;
  }>,
): McpToolOutcomeCounts {
  let succeeded = 0;
  let failed = 0;
  let empty = 0;
  for (const part of parts) {
    if (isToolPartFailed(part)) {
      failed += 1;
    } else if (isToolPartEmpty(part)) {
      empty += 1;
    } else if (part.state === "output-available") {
      succeeded += 1;
    }
  }
  return { total: parts.length, succeeded, failed, empty };
}

function formatOutcomeBreakdown(
  succeeded: number,
  failed: number,
  empty: number,
): string {
  const parts: string[] = [];
  if (succeeded > 0) {
    parts.push(`${succeeded.toLocaleString("en-US")} succeeded`);
  }
  if (failed > 0) {
    parts.push(`${failed.toLocaleString("en-US")} failed`);
  }
  if (empty > 0) {
    parts.push(`${empty.toLocaleString("en-US")} empty`);
  }
  return parts.join(", ");
}

function formatToolSummary(
  total: number,
  succeeded: number,
  failed: number,
  empty: number,
): string | null {
  if (total <= 0) {
    return null;
  }
  if (failed === total) {
    return formatLabeledCount(failed, "failed MCP tool", "failed MCP tools");
  }
  if (empty === total) {
    return formatLabeledCount(
      empty,
      "MCP tool with no results",
      "MCP tools with no results",
    );
  }
  const tools = formatLabeledCount(total, "MCP tool", "MCP tools");
  if (!tools) {
    return null;
  }
  if (failed <= 0 && empty <= 0) {
    return tools;
  }
  return `${tools} (${formatOutcomeBreakdown(succeeded, failed, empty)})`;
}

export function formatUsedSkillsAndTools(
  skillCount: number,
  toolCount: number,
  failedToolCount = 0,
  succeededToolCount?: number,
  emptyToolCount = 0,
): string | null {
  const succeeded =
    succeededToolCount === undefined
      ? Math.max(0, toolCount - failedToolCount - emptyToolCount)
      : succeededToolCount;
  const skills = formatLabeledCount(skillCount, "skill", "skills");
  const tools = formatToolSummary(
    toolCount,
    succeeded,
    failedToolCount,
    emptyToolCount,
  );
  if (skills && tools) {
    return `Used ${skills} and ${tools}`;
  }
  if (skills) {
    return `Used ${skills}`;
  }
  if (tools) {
    return `Used ${tools}`;
  }
  return null;
}

export function formatTurnDuration(ms: number | undefined): string | null {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return null;
  }
  const totalSeconds = Math.max(ms > 0 ? 1 : 0, Math.round(ms / 1000));
  if (totalSeconds === 0) {
    return "0s";
  }
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    if (seconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}
