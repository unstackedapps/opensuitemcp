import type { UIMessage, UIMessagePart } from "ai";
import { type ClassValue, clsx } from 'clsx';
import { formatISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { DBMessage } from '@/lib/db/schema';
import { ChatSDKError, type ErrorCode } from './errors';
import type { ChatMessage, ChatTools, CustomUIDataTypes } from './types';
import { stripResolvedSkillTokens } from './ai/skills/slash-tokens';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    const { code, cause } = await response.json();
    throw new ChatSDKError(code as ErrorCode, cause);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      const { code, cause } = await response.json();
      throw new ChatSDKError(code as ErrorCode, cause);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ChatSDKError('offline:chat');
    }

    throw error;
  }
}

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getMostRecentUserMessage(messages: UIMessage[]) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getTrailingMessageId({
  messages,
}: {
  messages: Array<{ id: string }>;
}): string | null {
  const trailingMessage = messages.at(-1);

  if (!trailingMessage) { return null; }

  return trailingMessage.id;
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
    metadata: {
      createdAt: formatISO(message.createdAt),
    },
  }));
}

export function getTextFromMessage(message: ChatMessage | UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string}).text)
    .join('');
}

/** Prepare chat history for the model: drop UI-only parts and strip slash tokens. */
export function prepareMessagesForModel(
  messages: ChatMessage[],
  options?: {
    invokedSkillSlugs?: Set<string>;
    fallbackText?: string;
  },
): ChatMessage[] {
  const invokedSkillSlugs = options?.invokedSkillSlugs ?? new Set<string>();
  const lastUserIndex = messages.findLastIndex(
    (message) => message.role === "user",
  );

  return messages.map((message, index) => ({
    ...message,
    parts: message.parts
      .filter((part) => part.type !== "data-invokedConnectedSkills")
      .map((part) => {
        if (
          part.type !== "text" ||
          message.role !== "user" ||
          index !== lastUserIndex ||
          invokedSkillSlugs.size === 0
        ) {
          return part;
        }

        const stripped = stripResolvedSkillTokens(
          part.text,
          invokedSkillSlugs,
        ).trim();
        return {
          type: "text" as const,
          text:
            stripped ||
            options?.fallbackText ||
            part.text,
        };
      }),
  }));
}
