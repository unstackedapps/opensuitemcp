const MAX_DEPTH = 8;

const MCP_ENVELOPE_KEYS = new Set([
  "content",
  "isError",
  "structuredContent",
  "_meta",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tryParseJsonContainer(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function unwrapToolOutput(output: unknown): unknown {
  if (!isRecord(output)) {
    return output;
  }
  if (output.success === true && "result" in output) {
    return output.result;
  }
  return output;
}

function isMcpEnvelope(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }
  if (!keys.every((key) => MCP_ENVELOPE_KEYS.has(key))) {
    return false;
  }
  return Array.isArray(value.content) || "structuredContent" in value;
}

function isEmptyContentItem(item: unknown, depth: number): boolean {
  if (!isRecord(item)) {
    return isEmptyValue(item, depth);
  }
  if (item.type !== "text") {
    return false;
  }
  if (typeof item.text !== "string") {
    return true;
  }
  return isEmptyValue(item.text, depth);
}

function isEmptyContent(items: unknown[], depth: number): boolean {
  if (items.length === 0) {
    return true;
  }
  for (const item of items) {
    if (!isEmptyContentItem(item, depth)) {
      return false;
    }
  }
  return true;
}

function isEmptyValue(value: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) {
    return true;
  }
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return true;
    }
    const parsed = tryParseJsonContainer(trimmed);
    if (parsed === undefined) {
      return false;
    }
    return isEmptyValue(parsed, depth + 1);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (!isRecord(value)) {
    return false;
  }
  if (isMcpEnvelope(value)) {
    if ("structuredContent" in value && value.structuredContent != null) {
      return isEmptyValue(value.structuredContent, depth + 1);
    }
    if (Array.isArray(value.content)) {
      return isEmptyContent(value.content, depth + 1);
    }
    return true;
  }

  const keys = Object.keys(value).filter((key) => value[key] !== undefined);
  return keys.length === 0;
}

export function isMcpToolEmptyResult(output: unknown): boolean {
  return isEmptyValue(unwrapToolOutput(output), 0);
}
