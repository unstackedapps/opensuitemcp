"use server";

import { generateText, type UIMessage } from "ai";
import type { VisibilityType } from "@/components/visibility-selector";
import { titlePrompt } from "@/lib/ai/prompts";
import type { AiProviderType } from "@/lib/ai/provider-entries";
import { getUserProvider } from "@/lib/ai/providers";
import { fallbackChatTitle, sanitizeChatTitle } from "@/lib/chat/chat-title";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatTitleById,
  updateChatVisibilityById,
} from "@/lib/db/queries";
import { getTextFromMessage } from "@/lib/utils";

function placeholderChatTitle(message: UIMessage): string {
  return fallbackChatTitle(getTextFromMessage(message));
}

export async function generateTitleFromUserMessage({
  message,
  apiKey,
  provider = "google",
  baseUrl,
  speedModelId,
  reasoningModelId,
}: {
  message: UIMessage;
  apiKey?: string | null;
  provider?: AiProviderType;
  baseUrl?: string;
  speedModelId?: string;
  reasoningModelId?: string;
}): Promise<{ title: string; summary: string | null }> {
  const text = getTextFromMessage(message);
  const fallbackTitle = placeholderChatTitle(message);

  if (!apiKey && provider !== "custom") {
    return { title: fallbackTitle, summary: null };
  }

  try {
    const providerInstance = getUserProvider(apiKey, provider, {
      baseUrl,
      speedModelId,
      reasoningModelId,
    });
    const { text: titleText } = await generateText({
      model: providerInstance.languageModel("title-model"),
      system: titlePrompt,
      prompt: text,
    });

    const title = sanitizeChatTitle(titleText) || fallbackTitle;
    return { title, summary: null };
  } catch (error) {
    console.error("[Title] Error generating title:", error);
    return { title: fallbackTitle, summary: null };
  }
}

export async function refineChatTitle({
  chatId,
  message,
  apiKey,
  provider = "google",
  baseUrl,
  speedModelId,
  reasoningModelId,
}: {
  chatId: string;
  message: UIMessage;
  apiKey?: string | null;
  provider?: AiProviderType;
  baseUrl?: string;
  speedModelId?: string;
  reasoningModelId?: string;
}): Promise<void> {
  const { title, summary } = await generateTitleFromUserMessage({
    message,
    apiKey,
    provider,
    baseUrl,
    speedModelId,
    reasoningModelId,
  });
  await updateChatTitleById({ chatId, title, summary });
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisibilityById({ chatId, visibility });
}
