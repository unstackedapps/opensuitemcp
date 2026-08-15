import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import {
  parseAiProviderConfig,
  resolveDefaultProviderId,
} from "@/lib/ai/provider-entries";
import {
  getChatById,
  getMessagesByChatId,
  getUserSettings,
} from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  const chat = await getChatById({ id });
  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get("chat-model");
  const initialChatModel = chatModelFromCookie?.value ?? DEFAULT_CHAT_MODEL;
  const settings = session.user?.id
    ? await getUserSettings({ userId: session.user.id })
    : null;
  const defaultAiProviderId = resolveDefaultProviderId(
    parseAiProviderConfig(settings?.aiProviders),
  );

  // The client updates the URL to /chat/:id before the first POST finishes
  // persisting the chat (title generation runs first). Treat unknown ids as a
  // new in-progress chat instead of 404 so refresh/navigation does not break.
  if (!chat) {
    return (
      <Chat
        autoResume={false}
        id={id}
        initialAiProviderId={defaultAiProviderId}
        initialChatModel={initialChatModel}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
      />
    );
  }

  if (chat.visibility === "private") {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
  });

  const uiMessages = convertToUIMessages(messagesFromDb);

  if (!chatModelFromCookie) {
    return (
      <Chat
        autoResume={true}
        id={chat.id}
        initialChatModel={DEFAULT_CHAT_MODEL}
        initialLastContext={chat.lastContext ?? undefined}
        initialAiProviderId={chat.aiProviderId ?? null}
        initialMaxIterationsReached={chat.maxIterationsReached}
        initialMessages={uiMessages}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
      />
    );
  }

  return (
    <Chat
      autoResume={true}
      id={chat.id}
      initialChatModel={chatModelFromCookie.value}
      initialLastContext={chat.lastContext ?? undefined}
      initialAiProviderId={chat.aiProviderId ?? null}
      initialMaxIterationsReached={chat.maxIterationsReached}
      initialMessages={uiMessages}
      initialVisibilityType={chat.visibility}
      isReadonly={session?.user?.id !== chat.userId}
    />
  );
}
