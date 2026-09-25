import type { JsonSchemaObject } from "./types";

/**
 * Hold one tool call to the schema its tool published.
 *
 * Until this existed the schema was decoration. `additionalProperties: false`
 * is declared on every tool written here and was enforced on none, so an agent
 * recording its own transcript — sending `parts` beside `text` to log a tool
 * call the way its host stores one — got a message id back and had the part
 * dropped on the floor. Silence is the worst available answer: the agent goes
 * on believing the work is recorded, and the person reading the thread later
 * never learns a step was lost.
 *
 * Deliberately shallow. Only what a schema actually states is checked, and
 * nested objects are left alone, so a NetSuite schema forwarded verbatim is
 * held to its own terms and no stricter.
 *
 * Returns a message naming the problem, or null when the arguments are usable.
 */
export function validateToolArgs(
  toolName: string,
  schema: JsonSchemaObject,
  args: Record<string, unknown>,
): string | null {
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  const known = Object.keys(properties);

  if (schema.additionalProperties === false) {
    const unknown = Object.keys(args).filter((key) => !known.includes(key));
    if (unknown.length > 0) {
      return `${toolName} does not accept ${list(unknown)}. It accepts ${list(known)}.`;
    }
  }

  for (const key of schema.required ?? []) {
    if (args[key] === undefined) {
      return `${toolName} requires \`${key}\`.`;
    }
  }

  for (const [key, rawRule] of Object.entries(properties)) {
    const value = args[key];
    if (value === undefined || !isRule(rawRule)) {
      continue;
    }

    const expected = typesOf(rawRule.type);
    if (expected.length > 0 && !expected.some((type) => matches(value, type))) {
      return `\`${key}\` must be ${list(expected)}.`;
    }

    const allowed = rawRule.enum;
    if (Array.isArray(allowed) && !allowed.includes(value as never)) {
      return `\`${key}\` must be one of ${list(allowed.map(String))}.`;
    }
  }

  return null;
}

function isRule(value: unknown): value is { type?: unknown; enum?: unknown[] } {
  return typeof value === "object" && value !== null;
}

function typesOf(type: unknown): string[] {
  if (typeof type === "string") {
    return [type];
  }
  if (Array.isArray(type)) {
    return type.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function matches(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return (
        typeof value === "object" && value !== null && !Array.isArray(value)
      );
    case "null":
      return value === null;
    default:
      // A type this does not model is not a type it may reject.
      return true;
  }
}

/** `a`, `b` and `c` — the phrasing an error message reads best with. */
function list(values: string[]): string {
  const quoted = values.map((value) => `\`${value}\``);
  if (quoted.length <= 1) {
    return quoted.join("");
  }
  return `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}
