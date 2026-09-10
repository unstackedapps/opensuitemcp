const MAX_DEPTH = 8;

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

function readErrorString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  return (
    readErrorString(value.message) ??
    readErrorString(value.detail) ??
    readErrorString(value.error)
  );
}

function extractContentText(
  value: Record<string, unknown>,
): string | undefined {
  if (!Array.isArray(value.content)) {
    return undefined;
  }
  const texts: string[] = [];
  for (const item of value.content) {
    if (
      !isRecord(item) ||
      item.type !== "text" ||
      typeof item.text !== "string"
    ) {
      continue;
    }
    const trimmed = item.text.trim();
    if (trimmed.length > 0) {
      texts.push(trimmed);
    }
  }
  if (texts.length === 0) {
    return undefined;
  }
  return texts.join("\n");
}

function errorFromRecord(record: Record<string, unknown>): string | undefined {
  const flagged =
    record.success === false || record.isError === true || record.ok === false;
  const errorField = readErrorString(record.error);
  if (errorField) {
    return errorField;
  }
  if (!flagged) {
    return undefined;
  }
  return (
    readErrorString(record.message) ??
    readErrorString(record.errorText) ??
    extractContentText(record) ??
    "Tool returned an error"
  );
}

function detectToolError(value: unknown, depth: number): string | undefined {
  if (depth > MAX_DEPTH || value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const parsed = tryParseJsonContainer(value);
    if (parsed !== undefined) {
      return detectToolError(parsed, depth + 1);
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const direct = errorFromRecord(value);
  if (direct) {
    return direct;
  }

  if ("result" in value) {
    const nested = detectToolError(value.result, depth + 1);
    if (nested) {
      return nested;
    }
  }
  if ("structuredContent" in value) {
    const nested = detectToolError(value.structuredContent, depth + 1);
    if (nested) {
      return nested;
    }
  }

  const contentText = extractContentText(value);
  if (contentText) {
    return detectToolError(contentText, depth + 1);
  }
  return undefined;
}

export function getMcpToolError(output: unknown): string | undefined {
  return detectToolError(output, 0);
}
