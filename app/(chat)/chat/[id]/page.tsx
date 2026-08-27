import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { CHAT_MODEL_COOKIE } from "@/lib/ai/composer-preferences";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import {
  normalizeCustomPersonas,
  resolvePersona,
} from "@/lib/ai/personas/catalog";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";
import {
  DEFAULT_PERSONA_ID_COOKIE,
  HIDE_PERSONA_PICKER_COOKIE,
  parseDefaultPersonaIdCookie,
  parseHidePersonaPickerCookie,
} from "@/lib/ai/personas/preferences";
import {
  parseAiProviderConfig,
  resolveDefaultProviderId,
} from "@/lib/ai/provider-entries";
import { isGuestAuthEnabled } from "@/lib/auth/guest-policy";
import { guestRegex } from "@/lib/constants";
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
    redirect(isGuestAuthEnabled() ? "/api/auth/guest" : "/login");
  }

  const chat = await getChatById({ id });
  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get(CHAT_MODEL_COOKIE);
  const initialChatModel = chatModelFromCookie?.value ?? DEFAULT_CHAT_MODEL;
  const settings = session.user?.id
    ? await getUserSettings({ userId: session.user.id })
    : null;
  const defaultAiProviderId = resolveDefaultProviderId(
    parseAiProviderConfig(settings?.aiProviders),
  );
  const isGuest = guestRegex.test(session.user?.email ?? "");
  const hideFromSettings = settings?.hidePersonaPicker ?? false;
  const hideFromCookie = parseHidePersonaPickerCookie(
    cookieStore.get(HIDE_PERSONA_PICKER_COOKIE)?.value,
  );
  const initialHidePersonaPicker = isGuest ? hideFromCookie : hideFromSettings;

  let initialDefaultPersonaId = settings?.defaultPersonaId ?? null;
  if (isGuest) {
    const fromCookie = parseDefaultPersonaIdCookie(
      cookieStore.get(DEFAULT_PERSONA_ID_COOKIE)?.value,
    );
    initialDefaultPersonaId = fromCookie === AVA_PERSONA_ID ? null : fromCookie;
  }

  // The client updates the URL to /chat/:id before the first POST finishes
  // persisting the chat. Treat unknown ids as a
  // new in-progress chat instead of 404 so refresh/navigation does not break.
  if (!chat) {
    return (
      <Chat
        autoResume={false}
        id={id}
        initialAiProviderId={defaultAiProviderId}
        initialChatModel={initialChatModel}
        initialDefaultPersonaId={initialDefaultPersonaId}
        initialHidePersonaPicker={initialHidePersonaPicker}
        initialMessages={[]}
        initialPersonaId={
          initialHidePersonaPicker ? initialDefaultPersonaId : null
        }
        initialVisibilityType="private"
        isGuestUser={isGuest}
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

  const resolvedPersona = resolvePersona({
    personaId: chat.personaId,
    customPersonas: normalizeCustomPersonas(settings?.customPersonas),
  });

  const chatProps = {
    autoResume: true as const,
    id: chat.id,
    initialAiProviderId: chat.aiProviderId ?? null,
    initialLastContext: chat.lastContext ?? undefined,
    initialMaxIterationsReached: chat.maxIterationsReached,
    initialMessages: uiMessages,
    initialPersonaId: chat.personaId ?? null,
    initialPersonaShortName:
      resolvedPersona.source === "custom"
        ? resolvedPersona.name
        : resolvedPersona.shortName,
    initialVisibilityType: chat.visibility,
    isGuestUser: isGuest,
    isReadonly: session?.user?.id !== chat.userId,
  };

  if (!chatModelFromCookie) {
    return <Chat {...chatProps} initialChatModel={DEFAULT_CHAT_MODEL} />;
  }

  return <Chat {...chatProps} initialChatModel={chatModelFromCookie.value} />;
}
