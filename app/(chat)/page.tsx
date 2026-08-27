import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { CHAT_MODEL_COOKIE } from "@/lib/ai/composer-preferences";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
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
import { getUserSettings } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { auth } from "../(auth)/auth";

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect(isGuestAuthEnabled() ? "/api/auth/guest" : "/login");
  }

  const id = generateUUID();
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get(CHAT_MODEL_COOKIE);
  const settings = session.user?.id
    ? await getUserSettings({ userId: session.user.id })
    : null;
  const initialAiProviderId = resolveDefaultProviderId(
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
    initialDefaultPersonaId = parseDefaultPersonaIdCookie(
      cookieStore.get(DEFAULT_PERSONA_ID_COOKIE)?.value,
    );
    if (initialDefaultPersonaId === AVA_PERSONA_ID) {
      initialDefaultPersonaId = null;
    }
  }

  const initialPersonaId =
    initialHidePersonaPicker && initialDefaultPersonaId
      ? initialDefaultPersonaId
      : initialHidePersonaPicker
        ? null
        : null;

  return (
    <Chat
      autoResume={false}
      id={id}
      initialAiProviderId={initialAiProviderId}
      initialChatModel={modelIdFromCookie?.value ?? DEFAULT_CHAT_MODEL}
      initialDefaultPersonaId={initialDefaultPersonaId}
      initialHidePersonaPicker={initialHidePersonaPicker}
      initialMessages={[]}
      initialPersonaId={initialPersonaId}
      initialVisibilityType="private"
      isGuestUser={isGuest}
      isReadonly={false}
      key={id}
    />
  );
}
