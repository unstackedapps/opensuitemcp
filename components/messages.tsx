import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { ArrowDownIcon } from "lucide-react";
import type React from "react";
import { memo, useEffect, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";
import {
  Conversation,
  ConversationContent,
} from "./message-elements/conversation";

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
};

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
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
  } = useMessages({
    status,
  });

  const { state: sidebarState, isMobile } = useSidebar();
  const isSidebarOpen = sidebarState === "expanded" && !isMobile;

  const prevStatusRef = useRef(status);
  const hasScrolledOnMountRef = useRef(false);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom on initial page load
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable and don't need to be in dependency arrays
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!hasScrolledOnMountRef.current && container && messages.length > 0) {
      hasScrolledOnMountRef.current = true;
      setTimeout(() => {
        if (container) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "auto",
          });
        }
      }, 100);
    }
  }, [messages.length]);

  // Auto-scroll to bottom from submission until response is complete
  // Only stops if user manually scrolls up more than 100px
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable and don't need to be in dependency arrays
  useEffect(() => {
    const container = messagesContainerRef.current;
    const shouldAutoScroll = status === "submitted" || status === "streaming";
    const wasStreaming = prevStatusRef.current === "streaming";
    const isNowComplete =
      wasStreaming && status !== "streaming" && status !== "submitted";

    if (shouldAutoScroll && container) {
      // Clear any existing interval
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }

      // Initial scroll when status changes to submitted or streaming
      const wasNotAutoScrolling =
        prevStatusRef.current !== "submitted" &&
        prevStatusRef.current !== "streaming";

      if (wasNotAutoScrolling) {
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: "smooth",
            });
          }
        });
      }

      // Continue auto-scrolling as long as user is within 100px of bottom
      // Use direct scrollTop assignment for smoother, non-jerky scrolling
      scrollIntervalRef.current = setInterval(() => {
        if (container && isAtBottom) {
          // Direct assignment is smoother than smooth scroll when called frequently
          container.scrollTop = container.scrollHeight;
        }
      }, 100);
    } else if (scrollIntervalRef.current) {
      // Clean up when not in auto-scroll state
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    // Final scroll when response completes (transition from streaming to complete)
    if (isNowComplete && container && isAtBottom) {
      // Use a small delay to ensure DOM has updated with final content
      setTimeout(() => {
        if (container) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth",
          });
        }
      }, 100);
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
    <div
      className="overscroll-behavior-contain -webkit-overflow-scrolling-touch scrollbar-hide relative flex-1 touch-pan-y overflow-y-scroll"
      ref={messagesContainerRef}
      style={{ overflowAnchor: "none" }}
    >
      <Conversation
        className={cn(
          "mx-auto flex min-w-0 max-w-4xl flex-col gap-4",
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

          {messages.map((message, index) => (
            <PreviewMessage
              chatId={chatId}
              isLoading={
                status === "streaming" && messages.length - 1 === index
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              regenerate={regenerate}
              setMessages={setMessages}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
            />
          ))}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </ConversationContent>
      </Conversation>

      {(status === "submitted" ||
        (status === "streaming" &&
          messages.some(
            (msg) =>
              msg.role === "assistant" &&
              (!msg.parts ||
                !msg.parts.some(
                  (part) =>
                    part.type === "text" &&
                    part.text &&
                    part.text.trim().length > 50,
                )),
          ))) && <ThinkingMessage key="thinking" />}

      {!isAtBottom && (
        <div
          className="pointer-events-none fixed bottom-44 z-10 transition-[left] duration-200 ease-linear"
          style={{
            left: isSidebarOpen ? "var(--sidebar-width, 20rem)" : "0",
            right: "0",
          }}
        >
          <div className="mx-auto flex max-w-4xl justify-center px-2 md:px-4">
            <button
              aria-label="Scroll to bottom"
              className="pointer-events-auto rounded-full border bg-background p-2 shadow-lg transition-colors hover:bg-muted"
              onClick={() => scrollToBottom("smooth")}
              type="button"
            >
              <ArrowDownIcon className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
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
});
