"use server";

import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";
import type { VisibilityType } from "@/components/visibility-selector";
import { summaryPrompt, titlePrompt } from "@/lib/ai/prompts";
import { getUserProvider } from "@/lib/ai/providers";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisibilityById,
} from "@/lib/db/queries";
import { getTextFromMessage } from "@/lib/utils";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

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

export async function generateTitleFromUserMessage({
  message,
  apiKey,
  provider = "google",
}: {
  message: UIMessage;
  apiKey?: string | null;
  provider?: "google" | "anthropic" | "openai";
}): Promise<{ title: string; summary: string | null }> {
  const text = getTextFromMessage(message);

  // If no API key is provided, use a default title based on message content
  if (!apiKey) {
    const defaultTitle = text.trim().slice(0, 50) || "New Chat";
    return { title: defaultTitle, summary: null };
  }

  try {
    const providerInstance = getUserProvider(apiKey, provider);
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
      title: cleanedTitle || text.trim().slice(0, 50) || "New Chat",
      summary: cleanedSummary || null,
    };
  } catch (error) {
    // If title generation fails (e.g., API key issue), fall back to default
    console.error("[Title] Error generating title:", error);
    const defaultTitle = text.trim().slice(0, 50) || "New Chat";
    return { title: defaultTitle, summary: null };
  }
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
