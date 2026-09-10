import { looksLikeSql, prettyPrintSql } from "./pretty-sql";

export type ToolDisplayLanguage = "json" | "xml" | "sql" | "text";

export type FormattedToolPayload = {
  id: string;
  language: ToolDisplayLanguage;
  code: string;
};

const MAX_INFLATE_DEPTH = 6;
const XML_TAG_START = /^<[A-Za-z_?][\s\S]*>/;

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

function inflateJsonStrings(value: unknown, depth = 0): unknown {
  if (depth > MAX_INFLATE_DEPTH) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = tryParseJsonContainer(value);
    if (parsed === undefined) {
      return value;
    }
    return inflateJsonStrings(parsed, depth + 1);
  }
  if (Array.isArray(value)) {
    return value.map((item) => inflateJsonStrings(item, depth + 1));
  }
  if (!isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    next[key] = inflateJsonStrings(nested, depth + 1);
  }
  return next;
}

function quoteDisplayString(value: string, indentLevel: number): string {
  const display = looksLikeSql(value) ? prettyPrintSql(value) : value;
  if (!display.includes("\n")) {
    return JSON.stringify(display);
  }
  const pad = "  ".repeat(indentLevel + 1);
  const escaped = display
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const [first, ...rest] = escaped.split("\n");
  return `"${[first, ...rest.map((line) => `${pad}${line}`)].join("\n")}"`;
}

function stringifyDisplayValue(value: unknown, indentLevel: number): string {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return quoteDisplayString(value, indentLevel);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const innerIndent = indentLevel + 1;
    const pad = "  ".repeat(innerIndent);
    const closingPad = "  ".repeat(indentLevel);
    const items = value.map((item) => {
      const rendered =
        item === undefined ? "null" : stringifyDisplayValue(item, innerIndent);
      return `${pad}${rendered}`;
    });
    return `[\n${items.join(",\n")}\n${closingPad}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(
      ([, nested]) => nested !== undefined,
    );
    if (entries.length === 0) {
      return "{}";
    }
    const innerIndent = indentLevel + 1;
    const pad = "  ".repeat(innerIndent);
    const closingPad = "  ".repeat(indentLevel);
    const lines = entries.map(([key, nested]) => {
      return `${pad}${JSON.stringify(key)}: ${stringifyDisplayValue(
        nested,
        innerIndent,
      )}`;
    });
    return `{\n${lines.join(",\n")}\n${closingPad}}`;
  }
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return String(value);
  }
}

function stringifyJson(value: unknown): string {
  try {
    return stringifyDisplayValue(inflateJsonStrings(value), 0);
  } catch {
    return String(value);
  }
}

function looksLikeXml(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("<")) {
    return false;
  }
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<!")) {
    return true;
  }
  return XML_TAG_START.test(trimmed);
}

function splitXmlParts(xml: string): string[] {
  const collapsed = xml.replace(/\r\n/g, "\n").replace(/>\s+</g, "><").trim();
  const parts: string[] = [];
  let remaining = collapsed;

  while (remaining.length > 0) {
    const nextTag = remaining.indexOf("<");
    if (nextTag > 0) {
      parts.push(remaining.slice(0, nextTag));
      remaining = remaining.slice(nextTag);
      continue;
    }
    if (nextTag === -1) {
      parts.push(remaining);
      break;
    }
    const end = remaining.indexOf(">");
    if (end === -1) {
      parts.push(remaining);
      break;
    }
    parts.push(remaining.slice(0, end + 1));
    remaining = remaining.slice(end + 1);
  }

  return parts;
}

function prettyPrintXml(xml: string): string {
  let indent = 0;
  const lines: string[] = [];

  for (const part of splitXmlParts(xml)) {
    const token = part.trim();
    if (!token) {
      continue;
    }
    const isClosing = token.startsWith("</");
    const isDeclaration = token.startsWith("<?") || token.startsWith("<!");
    const isSelfClosing = token.endsWith("/>") || isDeclaration;
    const isOpening = token.startsWith("<") && !isClosing && !isSelfClosing;
    if (isClosing) {
      indent = Math.max(indent - 1, 0);
    }
    lines.push(`${"  ".repeat(indent)}${token}`);
    if (isOpening) {
      indent += 1;
    }
  }

  return lines.join("\n");
}

function formatTextPayload(id: string, text: string): FormattedToolPayload {
  const parsedJson = tryParseJsonContainer(text);
  if (parsedJson !== undefined) {
    return { id, language: "json", code: stringifyJson(parsedJson) };
  }
  if (looksLikeXml(text)) {
    return { id, language: "xml", code: prettyPrintXml(text) };
  }
  if (looksLikeSql(text)) {
    return { id, language: "sql", code: prettyPrintSql(text) };
  }
  return { id, language: "text", code: text };
}

function formatUnknownPayload(
  id: string,
  value: unknown,
): FormattedToolPayload {
  if (typeof value === "string") {
    return formatTextPayload(id, value);
  }
  return { id, language: "json", code: stringifyJson(value) };
}

function redactBinaryFields(
  item: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...item };
  if (typeof copy.data === "string" && copy.data.length > 64) {
    copy.data = `[binary ${copy.data.length} chars]`;
  }
  if (typeof copy.blob === "string" && copy.blob.length > 64) {
    copy.blob = `[binary ${copy.blob.length} chars]`;
  }
  return copy;
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

function formatContentItem(item: unknown, index: number): FormattedToolPayload {
  const id = `content-${index}`;
  if (!isRecord(item)) {
    return formatUnknownPayload(id, item);
  }
  if (item.type === "text" && typeof item.text === "string") {
    return formatTextPayload(id, item.text);
  }
  return {
    id,
    language: "json",
    code: stringifyJson(redactBinaryFields(item)),
  };
}

export function formatMcpToolOutput(output: unknown): FormattedToolPayload[] {
  const unwrapped = unwrapToolOutput(output);
  if (!isRecord(unwrapped)) {
    return [formatUnknownPayload("value", unwrapped)];
  }

  if ("structuredContent" in unwrapped && unwrapped.structuredContent != null) {
    return [formatUnknownPayload("structured", unwrapped.structuredContent)];
  }

  if (Array.isArray(unwrapped.content)) {
    if (unwrapped.content.length === 0) {
      return [formatUnknownPayload("value", unwrapped)];
    }
    return unwrapped.content.map((item, index) =>
      formatContentItem(item, index),
    );
  }

  return [formatUnknownPayload("value", unwrapped)];
}

export function formatMcpToolInput(input: unknown): FormattedToolPayload {
  return formatUnknownPayload("input", input);
}

export function resolveToolCallArguments(part: {
  input?: unknown;
  args?: unknown;
  arguments?: unknown;
}): unknown {
  if (part.input !== undefined) {
    return part.input;
  }
  if (part.args !== undefined) {
    return part.args;
  }
  if (part.arguments !== undefined) {
    return part.arguments;
  }
}
