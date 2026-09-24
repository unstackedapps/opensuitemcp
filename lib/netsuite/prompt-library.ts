import {
  applyPromptPlaceholders,
  extractPromptPlaceholders,
  humanizePlaceholderToken,
  type PromptPlaceholderField,
} from "./prompt-placeholders";

/** NetSuite's Companion Prompt Library tool. */
export const NS_PROMPT_LIBRARY_TOOL = "ns_prompt_library_app";

export type NetSuitePrompt = {
  id: string;
  name: string;
  category: string;
  roles: string[];
  industries: string[];
  prompt: string;
};

export type PromptLibraryPayload = {
  prompts: NetSuitePrompt[];
  message?: string;
  error?: string;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toPrompt(value: unknown): NetSuitePrompt | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.category !== "string" ||
    typeof record.prompt !== "string" ||
    !Array.isArray(record.roles) ||
    !Array.isArray(record.industries)
  ) {
    return null;
  }
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    roles: asStringArray(record.roles),
    industries: asStringArray(record.industries),
    prompt: record.prompt,
  };
}

/**
 * Read the prompt records out of a `ns_prompt_library_app` result.
 *
 * The payload is addressed to a UI app, not to a model: it opens with a
 * `toClaude` field telling the reader to ignore the response and wait for the
 * app to continue. Anything that hands the raw text to an agent is handing it
 * an instruction to discard the hundred prompts underneath. Only `prompts`
 * leaves this function.
 */
export function parsePromptLibraryResult(
  result: unknown,
): PromptLibraryPayload {
  if (!result || typeof result !== "object") {
    return { prompts: [], error: "Empty tool result" };
  }

  const record = result as {
    content?: Array<{ type?: string; text?: string }>;
    error?: string;
  };
  if (typeof record.error === "string" && record.error) {
    return { prompts: [], error: record.error };
  }

  const text = record.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    return {
      prompts: [],
      error: "No prompt payload was received from NetSuite.",
    };
  }

  try {
    const parsed = JSON.parse(text) as {
      prompts?: unknown[];
      message?: string;
      error?: string;
    };
    const prompts = Array.isArray(parsed.prompts)
      ? parsed.prompts
          .map(toPrompt)
          .filter((prompt): prompt is NetSuitePrompt => prompt !== null)
      : [];
    return { prompts, message: parsed.message, error: parsed.error };
  } catch (error) {
    return {
      prompts: [],
      error:
        error instanceof Error
          ? `Failed to parse prompt payload: ${error.message}`
          : "Failed to parse prompt payload",
    };
  }
}

export type PromptFilters = {
  search?: string;
  category?: string;
  role?: string;
  industry?: string;
};

function includesFold(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Narrow the library locally.
 *
 * NetSuite's tool advertises a `filter` argument and ignores it — every value
 * comes back with the whole library — so filtering has to happen on this side
 * or a caller asking for vendor prompts receives all of them.
 */
export function filterPrompts(
  prompts: NetSuitePrompt[],
  filters: PromptFilters,
): NetSuitePrompt[] {
  const search = filters.search?.trim();
  const category = filters.category?.trim();
  const role = filters.role?.trim();
  const industry = filters.industry?.trim();

  return prompts.filter((prompt) => {
    if (
      search &&
      !(
        includesFold(prompt.name, search) ||
        includesFold(prompt.category, search) ||
        includesFold(prompt.prompt, search)
      )
    ) {
      return false;
    }
    if (category && !includesFold(prompt.category, category)) {
      return false;
    }
    if (role && !prompt.roles.some((item) => includesFold(item, role))) {
      return false;
    }
    if (
      industry &&
      !prompt.industries.some((item) => includesFold(item, industry))
    ) {
      return false;
    }
    return true;
  });
}

export type PromptPlaceholderSummary = {
  id: string;
  token: string;
  label: string;
};

function summarize(field: PromptPlaceholderField): PromptPlaceholderSummary {
  return {
    id: field.id,
    token: field.token,
    label: humanizePlaceholderToken(field.token),
  };
}

/** The values a prompt asks a caller to supply, as far as we can tell. */
export function promptPlaceholders(prompt: string): PromptPlaceholderSummary[] {
  return extractPromptPlaceholders(prompt).map(summarize);
}

export type FilledPrompt = {
  text: string;
  template: string;
  unfilled: PromptPlaceholderSummary[];
};

/**
 * Substitute what the caller supplied and report what is still open.
 *
 * Placeholders are detected, not declared — NetSuite ships no variable schema —
 * so this never refuses. A token the detector missed stays visible in
 * `template`, and a token left unfilled stays literal in `text`, which is what
 * the app does today.
 */
export function fillPrompt(
  prompt: string,
  values: Record<string, string> = {},
): FilledPrompt {
  const fields = extractPromptPlaceholders(prompt);
  const text = applyPromptPlaceholders(prompt, fields, values);
  const unfilled = fields
    .filter((field) => !values[field.id]?.trim())
    .map(summarize);
  return { text, template: prompt, unfilled };
}
