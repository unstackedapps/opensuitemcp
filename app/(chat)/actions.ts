"use server";

import { generateText, type UIMessage } from "ai";
import type { VisibilityType } from "@/components/visibility-selector";
import { summaryPrompt, titlePrompt } from "@/lib/ai/prompts";
import type { AiProviderType } from "@/lib/ai/provider-entries";
import { getUserProvider } from "@/lib/ai/providers";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatTitleById,
  updateChatVisibilityById,
} from "@/lib/db/queries";
import { getTextFromMessage } from "@/lib/utils";

function cleanText(text: string): string {
  return (
    text
      .trim()
      // Remove markdown headers (# ## ###)
      .replace(/^#+\s*/g, "")
      // Remove markdown bold/italic
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      // Remove quotes if at start/end
      .replace(/^["']|["']$/g, "")
      // Remove colons at the start
      .replace(/^:\s*/, "")
      // Remove "Title:" or "Summary:" prefix if present
      .replace(/^(Title|Summary):\s*/i, "")
      .trim()
  );
}

function placeholderChatTitle(message: UIMessage): string {
  const text = getTextFromMessage(message).trim();
  return text.slice(0, 50) || "New Chat";
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

  // If no API key is provided, use a default title based on message content
  if (!apiKey && provider !== "custom") {
    return { title: placeholderChatTitle(message), summary: null };
  }

  try {
    const providerInstance = getUserProvider(apiKey, provider, {
      baseUrl,
      speedModelId,
      reasoningModelId,
    });
    const titleModel = providerInstance.languageModel("title-model");

    // Step 1: Generate a longer summary (20-30 words)
    const { text: summaryText } = await generateText({
      model: titleModel,
      system: summaryPrompt,
      prompt: text,
    });

    let cleanedSummary = cleanText(summaryText);
    // Limit summary to reasonable length (about 200 characters / 30 words)
    if (cleanedSummary.length > 200) {
      cleanedSummary = `${cleanedSummary.slice(0, 197)}...`;
    }

    // Step 2: Generate a refined short title from the summary
    const { text: titleText } = await generateText({
      model: titleModel,
      system: titlePrompt,
      prompt: cleanedSummary,
    });

    let cleanedTitle = cleanText(titleText);
    // Limit to 60 characters and add ellipsis if truncated
    if (cleanedTitle.length > 60) {
      cleanedTitle = `${cleanedTitle.slice(0, 57)}...`;
    }

    return {
      title: cleanedTitle || placeholderChatTitle(message),
      summary: cleanedSummary || null,
    };
  } catch (error) {
    // If title generation fails (e.g., API key issue), fall back to default
    console.error("[Title] Error generating title:", error);
    return { title: placeholderChatTitle(message), summary: null };
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
