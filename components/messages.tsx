import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { ArrowDownIcon } from "lucide-react";
import type React from "react";
import { memo, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { useMessages } from "@/hooks/use-messages";
import { usePinToBottomOnLoad } from "@/hooks/use-pin-to-bottom-on-load";
import { getSkillsForAssistantTurn } from "@/lib/ai/skills/turn-chips";
import { groupMessageParts } from "@/lib/chat/group-message-parts";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";
import {
  Conversation,
  ConversationContent,
} from "./message-elements/conversation";
import { collectTurnSkillChips } from "./thinking-indicator";

type MessagesProps = {
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  selectedModelId: string;
  inputComponent?: React.ReactNode;
  onMcpAppUserMessage?: (text: string) => void;
  usage?: AppUsage;
};

function assistantHasStartedTyping(message: ChatMessage | undefined): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }
  return (message.parts ?? []).some((part) => {
    if (part.type === "text" && part.text.trim().length > 0) {
      return true;
    }
    return part.type === "reasoning" && part.text.trim().length > 0;
  });
}

/**
 * Answer text, as opposed to anything else a turn emits.
 *
 * Reasoning and tool parts arrive long before an answer does, and on a slow
 * NetSuite call they can be all there is for a while. Treating them as the
 * turn having started took the indicator away while the model was still
 * working, leaving a motionless screen.
 */
function assistantHasAnswerText(message: ChatMessage | undefined): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }
  return (message.parts ?? []).some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );
}

function assistantHasVisibleContent(message: ChatMessage | undefined): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }
  if (assistantHasStartedTyping(message)) {
    return true;
  }
  return groupMessageParts(message.parts).length > 0;
}

function previousUserCreatedAt(
  messages: ChatMessage[],
  index: number,
): string | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const item = messages.at(i);
    if (item?.role === "user") {
      return item.metadata?.createdAt;
    }
  }
}

function PureMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  selectedModelId: _selectedModelId,
  inputComponent,
  onMcpAppUserMessage,
  usage,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
  } = useMessages({
    status,
  });

  const prevStatusRef = useRef(status);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  usePinToBottomOnLoad(messagesContainerRef, chatId);
  const { data: skillsPayload } = useSWR("skills-settings", async () => {
    const response = await fetch("/api/skills");
    if (!response.ok) {
      return null;
    }
    return response.json();
  });
  const activeSkills = useMemo(
    () => collectTurnSkillChips(messages, skillsPayload ?? undefined),
    [messages, skillsPayload],
  );
  const lastMessage = messages.at(-1);
  const lastAssistantId = messages.findLast(
    (message) => message.role === "assistant",
  )?.id;
  const assistantStreaming =
    status === "streaming" && lastMessage?.role === "assistant";

  /** Nothing to render for this turn yet, so the message itself stays hidden. */
  const waitingForAssistant =
    (status === "submitted" && lastMessage?.role === "user") ||
    (assistantStreaming && !assistantHasVisibleContent(lastMessage));

  /**
   * Still working. Reasoning chips and tool calls count as progress to look at
   * but not as an answer, so the indicator stays with them until text starts.
   */
  const assistantStillWorking =
    (status === "submitted" && lastMessage?.role === "user") ||
    (assistantStreaming && !assistantHasAnswerText(lastMessage));

  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable
  useEffect(() => {
    const container = messagesContainerRef.current;
    const shouldAutoScroll = status === "submitted" || status === "streaming";
    const wasStreaming = prevStatusRef.current === "streaming";
    const isNowComplete =
      wasStreaming && status !== "streaming" && status !== "submitted";

    if (shouldAutoScroll && container) {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }

      const wasNotAutoScrolling =
        prevStatusRef.current !== "submitted" &&
        prevStatusRef.current !== "streaming";

      if (wasNotAutoScrolling) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }

      scrollIntervalRef.current = setInterval(() => {
        if (isAtBottom) {
          container.scrollTop = container.scrollHeight;
        }
      }, 100);
    } else if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    if (isNowComplete && container && isAtBottom) {
      container.scrollTop = container.scrollHeight;
    }

    prevStatusRef.current = status;

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    };
  }, [status, isAtBottom]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="overscroll-behavior-contain relative h-full touch-pan-y overflow-y-scroll"
        ref={messagesContainerRef}
        style={{ overflowAnchor: "none" }}
      >
        <Conversation
          className={cn(
            "mx-auto flex min-w-0 max-w-chat flex-col gap-4",
            messages.length === 0 && "h-full",
          )}
        >
          <ConversationContent
            className={cn(
              "flex flex-col gap-4 px-2 py-4 md:px-4",
              messages.length === 0 && "-mt-6 h-full justify-center",
            )}
          >
            {messages.length === 0 && <Greeting>{inputComponent}</Greeting>}

            {messages.map((message, index) => {
              if (
                waitingForAssistant &&
                message.role === "assistant" &&
                message.id === lastMessage?.id &&
                !assistantHasVisibleContent(message)
              ) {
                return null;
              }

              return (
                <PreviewMessage
                  activeSkills={activeSkills}
                  chatId={chatId}
                  isLoading={
                    status === "streaming" && messages.length - 1 === index
                  }
                  isReadonly={isReadonly}
                  key={message.id}
                  message={message}
                  onMcpAppUserMessage={onMcpAppUserMessage}
                  regenerate={regenerate}
                  setMessages={setMessages}
                  showThinking={
                    message.role === "assistant" &&
                    status === "streaming" &&
                    messages.length - 1 === index &&
                    !assistantHasStartedTyping(message)
                  }
                  turnSkills={
                    message.role === "assistant"
                      ? getSkillsForAssistantTurn(messages, message.id)
                      : undefined
                  }
                  turnStartedAt={
                    message.role === "assistant"
                      ? previousUserCreatedAt(messages, index)
                      : undefined
                  }
                  turnUsage={
                    message.role === "assistant" &&
                    message.id === lastAssistantId
                      ? usage
                      : undefined
                  }
                  vote={
                    votes
                      ? votes.find((vote) => vote.messageId === message.id)
                      : undefined
                  }
                />
              );
            })}

            {assistantStillWorking ? (
              <ThinkingMessage key="thinking" skills={activeSkills} />
            ) : null}

            <div className="min-h-6 shrink-0" ref={messagesEndRef} />
          </ConversationContent>
        </Conversation>
      </div>

      {!isAtBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <button
            aria-label="Scroll to bottom"
            className="pointer-events-auto rounded-full border bg-background p-2 shadow-lg transition-colors hover:bg-muted"
            data-testid="scroll-to-bottom-button"
            onClick={() => scrollToBottom("smooth")}
            type="button"
          >
            <ArrowDownIcon className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export const Messages = memo<MessagesProps>(
  PureMessages,
  (prevProps, nextProps) => {
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }
    if (prevProps.messages.length !== nextProps.messages.length) {
      return false;
    }
    if (!equal(prevProps.messages, nextProps.messages)) {
      return false;
    }
    if (!equal(prevProps.votes, nextProps.votes)) {
      return false;
    }

    return false;
  },
);
