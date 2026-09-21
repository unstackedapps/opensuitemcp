/**
 * NetSuite's MCP Standard Tools do not advertise whether a tool mutates data,
 * so the scope gate is derived from the tool name.
 *
 * The classifier is deliberately fail-closed: anything that looks like a
 * mutation, and anything unrecognised that is not clearly a read, requires the
 * `write` scope. A read-only key is therefore never the reason a record gets
 * changed, at the cost of occasionally hiding a harmless tool.
 */
const WRITE_VERBS = [
  "add",
  "approve",
  "attach",
  "cancel",
  "close",
  "copy",
  "create",
  "delete",
  "deploy",
  "detach",
  "disable",
  "enable",
  "import",
  "initialize",
  "insert",
  "install",
  "patch",
  "post",
  "put",
  "reject",
  "remove",
  "reset",
  "save",
  "send",
  "set",
  "submit",
  "sync",
  "transform",
  "update",
  "upload",
  "upsert",
  "void",
  "write",
];

const READ_VERBS = [
  "check",
  "count",
  "describe",
  "explain",
  "export",
  "fetch",
  "find",
  "get",
  "inspect",
  "list",
  "lookup",
  "preview",
  "query",
  "read",
  "search",
  "show",
  "summarize",
  "validate",
  "view",
];

/**
 * Query surfaces whose names carry no verb at all. SuiteQL is a SELECT-only
 * dialect and saved searches are read surfaces, so a name mentioning either —
 * and carrying no write verb — is a read.
 *
 * `run` and `execute` are deliberately absent from both verb lists: they read
 * for SuiteQL and write for scripts, so names using them fall through to this
 * check and then to the fail-closed default.
 */
const QUERY_TOOL_HINTS = ["suiteql", "savedsearch"];

const TOKEN_SPLIT = /[^a-z0-9]+/;

function tokenize(toolName: string): string[] {
  return toolName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter(Boolean);
}

export function netsuiteToolIsReadOnly(toolName: string): boolean {
  const tokens = tokenize(toolName);
  if (tokens.length === 0) {
    return false;
  }

  for (const token of tokens) {
    if (WRITE_VERBS.includes(token)) {
      return false;
    }
  }

  for (const token of tokens) {
    if (READ_VERBS.includes(token)) {
      return true;
    }
  }

  const joined = tokens.join("");
  return QUERY_TOOL_HINTS.some((hint) => joined.includes(hint));
}

export function netsuiteToolRequiredScope(toolName: string): "read" | "write" {
  return netsuiteToolIsReadOnly(toolName) ? "read" : "write";
}
