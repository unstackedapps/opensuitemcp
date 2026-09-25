import "server-only";

import { appendChatMessage, getUserSettings, saveChat } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { resolveAssignedPersona } from "../persona-assignment";
import { buildMessageParts } from "./chat-parts";
import { type McpToolDefinition, toolError, toolResult } from "./types";

const MAX_TITLE = 200;
const MAX_SUMMARY = 1000;
/** Chat.personaId is varchar(64); a key may hold a longer custom persona id. */
const MAX_CHAT_PERSONA_ID = 64;

const APPENDABLE_ROLES = ["user", "assistant"] as const;
type AppendableRole = (typeof APPENDABLE_ROLES)[number];

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

const createChat: McpToolDefinition = {
  name: "osmcp_create_chat",
  title: "Create chat",
  description:
    "Open a new thread in this user's OpenSuiteMCP chat history to record what this agent is doing. The thread is private to the user and appears in their sidebar alongside their own conversations, which is how a person reviews autonomous work after the fact. Create one at the start of a task, then record each step with osmcp_append_chat. The thread is stamped with the persona this key acts as.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "What this thread is about, as a person would read it in a sidebar.",
      },
      summary: {
        type: "string",
        description: "Optional one-paragraph summary of the task.",
      },
    },
    required: ["title"],
    additionalProperties: false,
  },
  annotations: { title: "Create chat", ...WRITE },
  execute: async (args, principal) => {
    const title = readString(args, "title");
    if (!title) {
      return toolError("Pass a `title` describing what this thread is about.");
    }

    const summary = readString(args, "summary").slice(0, MAX_SUMMARY);
    const chatId = generateUUID();
    // The persona the key actually acts as, so a thread is never stamped with
    // an id that has since been deleted.
    const settings = await getUserSettings({ userId: principal.userId });
    const acting = resolveAssignedPersona(
      principal.personaId,
      settings?.customPersonas,
    );
    const personaId =
      acting.id.length <= MAX_CHAT_PERSONA_ID ? acting.id : null;

    await saveChat({
      id: chatId,
      userId: principal.userId,
      title: title.slice(0, MAX_TITLE),
      ...(summary ? { summary } : {}),
      visibility: "private",
      personaId,
    });

    return toolResult(
      {
        chatId,
        title: title.slice(0, MAX_TITLE),
        personaId,
        visibility: "private",
      },
      `Created chat ${chatId}. Record steps with osmcp_append_chat.`,
    );
  },
};

const appendChat: McpToolDefinition = {
  name: "osmcp_append_chat",
  title: "Append to chat",
  description:
    "Add a message to a thread this agent owns, so a person can read what happened. Use role `user` for the instruction or trigger this agent acted on, and `assistant` for what the agent did or concluded. Append as you go rather than in one block at the end — a thread that stops mid-task is itself a useful record. For plain prose pass `text`. To record a turn as it actually happened, pass `parts` instead: entries of kind `text`, `reasoning`, or `tool` with the tool's `name`, `input` and `output` — a recorded tool call is shown the way this app shows its own, with its arguments and result, rather than described in prose.",
  inputSchema: {
    type: "object",
    properties: {
      chatId: {
        type: "string",
        description:
          "A `chatId` from osmcp_create_chat, or an `id` from osmcp_list_chats.",
      },
      role: {
        type: "string",
        enum: [...APPENDABLE_ROLES],
        description:
          "`user` for the instruction acted on, `assistant` for this agent's own work.",
      },
      text: {
        type: "string",
        description:
          "The message body as markdown. Use this or `parts`, not both.",
      },
      parts: {
        type: "array",
        description:
          "The turn as it happened, in order. Use instead of `text` when the turn had reasoning or tool calls worth keeping.",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["text", "reasoning", "tool"],
              description:
                "`text` for prose, `reasoning` for the agent's thinking, `tool` for a call it made.",
            },
            text: {
              type: "string",
              description: "Body of a `text` or `reasoning` part.",
            },
            name: {
              type: "string",
              description:
                "Name of the tool called, as its own system reports it.",
            },
            input: {
              type: "object",
              description: "Arguments the tool was called with.",
            },
            output: {
              description: "What the tool returned. Omit if it has not yet.",
            },
            error: {
              type: "string",
              description: "Why the call failed, if it did.",
            },
          },
          required: ["kind"],
        },
      },
    },
    required: ["chatId", "role"],
    additionalProperties: false,
  },
  annotations: { title: "Append to chat", ...WRITE },
  execute: async (args, principal) => {
    const chatId = readString(args, "chatId");
    const role = readString(args, "role");
    const text = typeof args.text === "string" ? args.text : "";

    if (!chatId) {
      return toolError("Pass the `chatId` of a thread to append to.");
    }
    if (!APPENDABLE_ROLES.includes(role as AppendableRole)) {
      return toolError(
        `\`role\` must be one of ${APPENDABLE_ROLES.join(", ")}.`,
      );
    }
    const built = buildMessageParts({ role, text, parts: args.parts });
    if (!built.ok) {
      return toolError(built.error);
    }

    const messageId = generateUUID();
    // Ownership is settled inside the append, under the same lock that keeps
    // this message behind the last one. Same answer for "not found" and
    // "someone else's": an agent must not be able to probe for the existence
    // of another user's threads.
    const appended = await appendChatMessage({
      chatId,
      userId: principal.userId,
      id: messageId,
      role,
      parts: built.parts,
    });

    if (!appended) {
      return toolError(
        `No chat \`${chatId}\` belongs to this user. Create one with osmcp_create_chat.`,
      );
    }

    return toolResult(
      {
        messageId,
        chatId,
        role,
        parts: built.parts.length,
        createdAt: appended.createdAt.toISOString(),
      },
      `Recorded a ${role} message in ${appended.chatTitle}.`,
    );
  },
};

export const chatWriteTools: McpToolDefinition[] = [createChat, appendChat];
