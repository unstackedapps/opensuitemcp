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

/** A stable, client-safe name for a prompt the account publishes. */
export function netsuitePromptName(prompt: NetSuitePrompt): string {
  const slug = prompt.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `${NETSUITE_PROMPT_PREFIX}${slug || "prompt"}`;
}

export function netsuitePromptToMcp(
  prompt: NetSuitePrompt,
): McpPromptDefinition {
  const audience = [...prompt.roles, ...prompt.industries]
    .filter(Boolean)
    .join(", ");
  return {
    name: netsuitePromptName(prompt),
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
    arguments: promptPlaceholders(prompt.prompt).map((placeholder) => ({
      name: placeholder.id,
      description: placeholder.label,
    })),
  };
}
