/**
 * The prompts this server publishes.
 *
 * A tool is something a model decides to call; a prompt is something a person
 * picks. Clients render these in their own `/` menu, which is the only place
 * a capability of this server is visible to the person using it — the
 * instructions sent at initialize reach the model and nobody else.
 *
 * Pure: the built-in list and the mapping from a NetSuite Companion prompt
 * both live here so they can be tested without an account.
 */

import type { NetSuitePrompt } from "@/lib/netsuite/prompt-library";
import { promptPlaceholders } from "@/lib/netsuite/prompt-library";

export type McpPromptArgument = {
  name: string;
  description?: string;
  required?: boolean;
};

export type McpPromptDefinition = {
  name: string;
  title: string;
  description: string;
  arguments: McpPromptArgument[];
};

export type McpPromptMessage = {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
};

/** Prefix for a prompt that came from the account's Companion library. */
export const NETSUITE_PROMPT_PREFIX = "netsuite_";

/**
 * Workflows this server knows and a connecting model does not.
 *
 * Each one is the opening sequence for a kind of work: which identity to
 * confirm, which instructions to read, and where to record what happens. A
 * model will not do these unprompted, because nothing in a tool name says to.
 */
export const BUILTIN_MCP_PROMPTS: McpPromptDefinition[] = [
  {
    name: "osmcp_start_task",
    title: "Start a NetSuite task",
    description:
      "Confirm the acting identity, adopt the assigned persona and its skills, open a thread to record the work, then start.",
    arguments: [
      {
        name: "task",
        description: "What to do in NetSuite.",
        required: true,
      },
    ],
  },
  {
    name: "osmcp_choose_persona",
    title: "Choose the right specialist",
    description:
      "Read the personas this workspace has, judge which fits the work, and switch to it before starting.",
    arguments: [
      {
        name: "task",
        description: "The work the specialist is being chosen for.",
        required: true,
      },
    ],
  },
  {
    name: "osmcp_record_session",
    title: "Record this session in OpenSuiteMCP",
    description:
      "Write what has happened so far into a thread in the workspace owner's sidebar.",
    arguments: [
      {
        name: "summary",
        description:
          "A title for the thread. One derived from the work if omitted.",
      },
    ],
  },
  {
    name: "osmcp_capture_skill",
    title: "Save what you learned as a skill",
    description:
      "Turn what this session established into a skill in the workspace library, and attach it to the persona that needs it.",
    arguments: [
      {
        name: "topic",
        description: "What the skill should cover.",
      },
    ],
  },
];

function argumentValue(
  args: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = args?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function builtinPromptMessages(
  name: string,
  args?: Record<string, unknown>,
): McpPromptMessage[] | null {
  const text = (body: string): McpPromptMessage[] => [
    { role: "user", content: { type: "text", text: body } },
  ];

  switch (name) {
    case "osmcp_start_task": {
      const task = argumentValue(args, "task");
      return text(
        [
          "Work this task in my OpenSuiteMCP NetSuite workspace, in this order:",
          "",
          "1. Call osmcp_whoami. It reports who you act as, which NetSuite account is active, and which persona this connection is assigned.",
          "2. Read that persona with osmcp_get_persona and work as it.",
          "3. Read every skill the persona carries with osmcp_get_skill. Where a skill names a file, read it with osmcp_read_skill_file.",
          "4. Open a thread with osmcp_create_chat, then record each step with osmcp_append_chat as you go.",
          "5. Do the work.",
          "",
          task ? `The task: ${task}` : "Ask me what the task is.",
        ].join("\n"),
      );
    }
    case "osmcp_choose_persona": {
      const task = argumentValue(args, "task");
      return text(
        [
          "Pick the specialist for this work before starting it.",
          "",
          "1. Call osmcp_list_personas. Each entry carries a primaryRole and the skillIds it brings into a turn.",
          "2. Say which persona fits and why, in one line.",
          "3. Adopt it with osmcp_set_agent_persona, then read it with osmcp_get_persona and read the skills it carries.",
          "4. If none fits, say so, and offer to write one with osmcp_create_persona.",
          "",
          task ? `The work: ${task}` : "Ask me what the work is.",
        ].join("\n"),
      );
    }
    case "osmcp_record_session": {
      const summary = argumentValue(args, "summary");
      return text(
        [
          "Record this session in my OpenSuiteMCP workspace so I can read it later.",
          "",
          `1. Open a thread with osmcp_create_chat${summary ? `, titled "${summary}"` : ", titled after what we worked on"}.`,
          "2. Append what has happened with osmcp_append_chat, in order. Use role `user` for what I asked and `assistant` for what you did.",
          "3. Pass `parts` rather than `text` where a turn included reasoning or tool calls, so the thread shows them as they happened.",
          "4. Keep appending as this session continues.",
        ].join("\n"),
      );
    }
    case "osmcp_capture_skill": {
      const topic = argumentValue(args, "topic");
      return text(
        [
          "Turn what we established into a skill in my OpenSuiteMCP library.",
          "",
          "1. Call osmcp_list_skills first. If a skill already covers this, revise it with osmcp_update_skill rather than writing a second one; if it is not yours to change, copy it with osmcp_clone_skill.",
          "2. Write it with osmcp_create_skill: the procedure, the checks that catch a bad result, the record types and saved searches it relies on, and where it does not apply.",
          "3. Give it a `description` — one line, so the next agent can choose it without opening it.",
          "4. Attach it to the persona that needs it with osmcp_pair_skills.",
          "",
          topic
            ? `What it should cover: ${topic}`
            : "Cover what this session actually established, not what we intended to do.",
        ].join("\n"),
      );
    }
    default:
      return null;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 56);
}

/**
 * A name for a prompt the account publishes.
 *
 * Built from the prompt's name rather than its id, because the library
 * numbers its entries — a menu of `netsuite_1` through `netsuite_100` names
 * nothing. `suffix` disambiguates the entries that share a name; the library
 * ships two called "Current Period Financial Overview".
 */
export function netsuitePromptName(
  prompt: NetSuitePrompt,
  suffix?: string,
): string {
  const slug = slugify(prompt.name) || slugify(prompt.id) || "prompt";
  const tail = suffix ? `_${slugify(suffix)}` : "";
  return `${NETSUITE_PROMPT_PREFIX}${slug}${tail}`;
}

/**
 * Names for a whole library, each resolving back to one prompt.
 *
 * Collisions take the prompt's id as a suffix rather than being dropped: a
 * skipped entry is one a person can see in NetSuite and cannot pick here.
 */
export function netsuitePromptNames(
  prompts: readonly NetSuitePrompt[],
  taken: ReadonlySet<string>,
): Map<string, string> {
  const used = new Set(taken);
  const names = new Map<string, string>();
  for (const prompt of prompts) {
    let name = netsuitePromptName(prompt);
    if (used.has(name)) {
      name = netsuitePromptName(prompt, prompt.id);
    }
    // Two entries sharing a name *and* an id cannot both be addressed; the
    // second is skipped rather than shadowing the first.
    if (used.has(name)) {
      continue;
    }
    used.add(name);
    names.set(prompt.id, name);
  }
  return names;
}

/**
 * A prompt's blanks, as arguments a client can render.
 *
 * The internal placeholder id is `[current period]#0` — brackets and an
 * occurrence index — which is addressable but not a name anyone should read
 * in a form. The argument takes a slug of the label instead, and `placeholder`
 * carries the id so a filled value gets back to the right blank. Repeats are
 * numbered, because a prompt asking for two periods needs two fields.
 */
export function netsuitePromptArguments(
  prompt: NetSuitePrompt,
): Array<McpPromptArgument & { placeholder: string }> {
  const used = new Map<string, number>();
  return promptPlaceholders(prompt.prompt).map((placeholder) => {
    const base = slugify(placeholder.label) || "value";
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return {
      name: seen === 0 ? base : `${base}_${seen + 1}`,
      description: placeholder.label,
      placeholder: placeholder.id,
    };
  });
}

/**
 * The placeholder a supplied argument fills.
 *
 * Both the clean name and the raw placeholder id are accepted: a client that
 * read the id from somewhere else should still work.
 */
export function netsuitePromptValues(
  prompt: NetSuitePrompt,
  args: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!args) {
    return {};
  }
  const byName = new Map(
    netsuitePromptArguments(prompt).map((entry) => [
      entry.name,
      entry.placeholder,
    ]),
  );
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) {
      continue;
    }
    values[byName.get(key) ?? key] = String(value);
  }
  return values;
}

export function netsuitePromptToMcp(
  prompt: NetSuitePrompt,
  name = netsuitePromptName(prompt),
): McpPromptDefinition {
  const audience = [...prompt.roles, ...prompt.industries]
    .filter(Boolean)
    .join(", ");
  return {
    name,
    title: prompt.name,
    description: [
      prompt.category ? `${prompt.category}.` : "",
      "From this account's NetSuite Companion prompt library.",
      audience ? `For ${audience}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    // Placeholders are detected, not declared — NetSuite publishes no schema
    // for them — so none is marked required.
    arguments: netsuitePromptArguments(prompt).map(
      ({ placeholder: _placeholder, ...argument }) => argument,
    ),
  };
}
