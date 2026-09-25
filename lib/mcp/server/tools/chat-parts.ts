import { randomUUID } from "node:crypto";

/**
 * Turn what an agent reports into the parts a chat message is made of.
 *
 * A person's turn in this app is not prose. It is reasoning, then tool calls
 * with their arguments and results, then an answer, and the transcript is
 * readable because each of those is stored as itself. An agent working in
 * Claude or Gemini has the same material and, until now, one place to put it:
 * a `text` field. Everything else was flattened into prose or lost, so the
 * record a person came to review was a summary of the work rather than the
 * work.
 *
 * Tool calls are recorded as `dynamic-tool`, the shape the AI SDK reserves for
 * tools not known at build time. That keeps a tool an agent ran in some other
 * system from being mistaken for one of this app's own — a recorded `ns_*`
 * call would otherwise render through NetSuite's bespoke branch and claim an
 * authority it does not have.
 */

/** Matches what a person could paste into one chat turn. */
export const MAX_APPEND_TEXT = 32_000;
const MAX_PARTS = 50;
const MAX_TOOL_PAYLOAD = 16_000;
const MAX_TOOL_NAME = 128;

export type AppendPartInput = {
  kind?: unknown;
  text?: unknown;
  name?: unknown;
  input?: unknown;
  output?: unknown;
  error?: unknown;
};

export type BuiltParts =
  | { ok: true; parts: Array<Record<string, unknown>> }
  | { ok: false; error: string };

export function buildMessageParts(params: {
  role: string;
  text: string;
  parts: unknown;
  newId?: () => string;
}): BuiltParts {
  const { role, text, parts } = params;
  const newId = params.newId ?? randomUUID;

  if (parts === undefined) {
    if (!text.trim()) {
      return { ok: false, error: "Pass the `text` to record, or `parts`." };
    }
    if (text.length > MAX_APPEND_TEXT) {
      return { ok: false, error: tooLong(text.length) };
    }
    return { ok: true, parts: [{ type: "text", text }] };
  }

  if (text.trim()) {
    return {
      ok: false,
      error:
        "Pass either `text` or `parts`, not both. Plain prose is a `parts` entry of kind `text`.",
    };
  }
  if (!Array.isArray(parts)) {
    return { ok: false, error: "`parts` must be an array." };
  }
  if (parts.length === 0) {
    return { ok: false, error: "`parts` is empty; pass something to record." };
  }
  if (parts.length > MAX_PARTS) {
    return {
      ok: false,
      error: `\`parts\` is limited to ${MAX_PARTS} entries; this one has ${parts.length}. Append it in more than one message.`,
    };
  }

  const built: Array<Record<string, unknown>> = [];
  let textBudget = 0;

  for (const [index, raw] of parts.entries()) {
    const at = `parts[${index}]`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: `${at} must be an object.` };
    }
    const part = raw as AppendPartInput;

    if (part.kind === "text" || part.kind === "reasoning") {
      if (typeof part.text !== "string" || !part.text.trim()) {
        return {
          ok: false,
          error: `${at} is a ${part.kind} part and needs \`text\`.`,
        };
      }
      if (part.kind === "reasoning" && role !== "assistant") {
        return {
          ok: false,
          error: "Only an `assistant` message carries reasoning.",
        };
      }
      textBudget += part.text.length;
      if (textBudget > MAX_APPEND_TEXT) {
        return { ok: false, error: tooLong(textBudget) };
      }
      built.push({ type: part.kind, text: part.text });
      continue;
    }

    if (part.kind === "tool") {
      if (role !== "assistant") {
        return {
          ok: false,
          error: "Only an `assistant` message carries a tool call.",
        };
      }
      if (typeof part.name !== "string" || !part.name.trim()) {
        return { ok: false, error: `${at} is a tool part and needs \`name\`.` };
      }
      if (part.name.length > MAX_TOOL_NAME) {
        return {
          ok: false,
          error: `${at} has a \`name\` longer than ${MAX_TOOL_NAME} characters.`,
        };
      }
      const oversized = payloadTooBig(at, part.input, part.output);
      if (oversized) {
        return { ok: false, error: oversized };
      }
      if (part.error !== undefined && typeof part.error !== "string") {
        return {
          ok: false,
          error: `${at} has an \`error\` that is not a string.`,
        };
      }

      const base = {
        type: "dynamic-tool",
        toolName: part.name,
        toolCallId: newId(),
        input: part.input ?? {},
      };

      if (typeof part.error === "string" && part.error.trim()) {
        built.push({ ...base, state: "output-error", errorText: part.error });
      } else if (part.output !== undefined) {
        built.push({ ...base, state: "output-available", output: part.output });
      } else {
        built.push({ ...base, state: "input-available" });
      }
      continue;
    }

    return {
      ok: false,
      error: `${at} has an unknown \`kind\`. Use \`text\`, \`reasoning\` or \`tool\`.`,
    };
  }

  return { ok: true, parts: built };
}

function tooLong(length: number): string {
  return `The text is limited to ${MAX_APPEND_TEXT} characters; this one is ${length}. Append it in parts.`;
}

function payloadTooBig(
  at: string,
  input: unknown,
  output: unknown,
): string | null {
  for (const [label, value] of [
    ["input", input],
    ["output", output],
  ] as const) {
    if (value === undefined) {
      continue;
    }
    let size: number;
    try {
      size = JSON.stringify(value)?.length ?? 0;
    } catch {
      return `${at} has an \`${label}\` that cannot be stored as JSON.`;
    }
    if (size > MAX_TOOL_PAYLOAD) {
      return `${at} has an \`${label}\` of ${size} characters; the limit is ${MAX_TOOL_PAYLOAD}. Record a summary of it instead.`;
    }
  }
  return null;
}
