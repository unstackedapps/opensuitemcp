/**
 * Clears a chat's unviewed dot. Failure is silent: the dot staying blue for one
 * more poll is not worth a toast.
 */
export async function markChatViewed(chatId: string): Promise<void> {
  try {
    await fetch(`/api/chat/${chatId}/viewed`, { method: "POST" });
  } catch (error) {
    console.warn("[Chat] Failed to mark chat viewed:", error);
  }
}
