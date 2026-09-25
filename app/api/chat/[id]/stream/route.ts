import { createUIMessageStream, JsonToSseTransformStream } from "ai";
import { differenceInSeconds } from "date-fns";
import { auth } from "@/app/(auth)/auth";
import { getStreamContext } from "@/lib/api/stream-context";
import {
  getChatById,
  getMessagesByChatId,
  getStreamIdsByChatId,
} from "@/lib/db/queries";
import type { Chat } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: chatId } = await params;

  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  if (!chatId) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  let chat: Chat | null;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  if (!chat) {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  if (chat.visibility === "private" && chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });
  const recentStreamId = streamIds.at(-1);

  /*
   * A chat that never opened a stream has nothing to resume, and that is not a
   * failure. A thread written over Agent access is the ordinary case:
   * osmcp_append_chat records messages directly and never starts a generation,
   * so a thread left on a user message — which the tool invites, a record that
   * stops mid-task still being a record — asks to resume a stream that was
   * never going to exist. Answered like a missing stream context above, with no
   * content, rather than as an error the reader is shown under the transcript.
   */
  if (!recentStreamId) {
    return new Response(null, { status: 204 });
  }

  const emptyDataStream = createUIMessageStream<ChatMessage>({
    execute: () => {
      // Empty function - intentionally no-op for empty data stream
    },
  });

  const stream = await streamContext.resumableStream(recentStreamId, () =>
    emptyDataStream.pipeThrough(new JsonToSseTransformStream()),
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== "assistant") {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        writer.write({
          type: "data-appendMessage",
          data: JSON.stringify(mostRecentMessage),
          transient: true,
        });
      },
    });

    return new Response(
      restoredStream.pipeThrough(new JsonToSseTransformStream()),
      { status: 200 },
    );
  }

  return new Response(stream, { status: 200 });
}
