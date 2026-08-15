import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import {
  parseAiProviderConfig,
  resolveDefaultProviderId,
} from "@/lib/ai/provider-entries";
import { getUserSettings } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { auth } from "../(auth)/auth";

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  const id = generateUUID();
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get("chat-model");
  const settings = session.user?.id
    ? await getUserSettings({ userId: session.user.id })
    : null;
  const initialAiProviderId = resolveDefaultProviderId(
    parseAiProviderConfig(settings?.aiProviders),
  );

  return (
    <Chat
      autoResume={false}
      id={id}
      initialAiProviderId={initialAiProviderId}
      initialChatModel={modelIdFromCookie?.value ?? DEFAULT_CHAT_MODEL}
      initialMessages={[]}
      initialVisibilityType="private"
      isReadonly={false}
      key={id}
    />
  );
}
