import "server-only";

import { getChatById, saveChat, saveMessages } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { type McpToolDefinition, toolError, toolResult } from "./types";

const MAX_TITLE = 200;
const MAX_SUMMARY = 1000;
/** Matches what a person could paste into one chat turn. */
const MAX_APPEND_TEXT = 32_000;
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
    "Open a new thread in this user's OpenSuiteMCP chat history to record what this agent is doing. The thread is private to the user and appears in their sidebar alongside their own conversations, which is how a person reviews autonomous work after the fact. Create one at the start of a task, then record each step with osmcp_append_chat. If this key is assigned a persona, the thread is stamped with it.",
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
    const personaId =
      principal.personaId && principal.personaId.length <= MAX_CHAT_PERSONA_ID
        ? principal.personaId
        : null;

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
    "Add a message to a thread this agent owns, so a person can read what happened. Use role `user` for the instruction or trigger this agent acted on, and `assistant` for what the agent did or concluded. Append as you go rather than in one block at the end — a thread that stops mid-task is itself a useful record.",
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
        description: "The message body as markdown.",
      },
    },
    required: ["chatId", "role", "text"],
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
    if (!text.trim()) {
      return toolError("Pass the `text` to record.");
    }
    if (text.length > MAX_APPEND_TEXT) {
      return toolError(
        `\`text\` is limited to ${MAX_APPEND_TEXT} characters; this one is ${text.length}. Append it in parts.`,
      );
    }

    const chat = await getChatById({ id: chatId });
    // Same answer for "not found" and "someone else's": an agent must not be
    // able to probe for the existence of another user's threads.
    if (!chat || chat.userId !== principal.userId) {
      return toolError(
        `No chat \`${chatId}\` belongs to this user. Create one with osmcp_create_chat.`,
      );
    }

    const messageId = generateUUID();
    await saveMessages({
      messages: [
        {
          id: messageId,
          chatId,
          role,
          parts: [{ type: "text", text }],
          createdAt: new Date(),
        },
      ],
    });

    return toolResult(
      { messageId, chatId, role },
      `Recorded a ${role} message in ${chat.title}.`,
    );
  },
};

export const chatWriteTools: McpToolDefinition[] = [createChat, appendChat];
