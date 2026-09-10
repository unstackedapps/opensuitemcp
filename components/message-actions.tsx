"use client";

import equal from "fast-deep-equal";
import { Fragment, memo } from "react";
import { useSWRConfig } from "swr";
import { useCopyToClipboard } from "usehooks-ts";
import {
  formatTurnDuration,
  formatTurnTokenCount,
  getMessageTurnDurationMs,
  getMessageTurnUsage,
} from "@/lib/chat/message-turn-meta";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { CopyIcon, PencilEditIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";
import { Action, Actions } from "./message-elements/actions";
import { toast } from "./toast";

function MessageTurnMeta({
  message,
  fallbackUsage,
  turnStartedAt,
}: {
  message: ChatMessage;
  fallbackUsage?: AppUsage;
  turnStartedAt?: string;
}) {
  const usage = getMessageTurnUsage(message) ?? fallbackUsage;
  const tokensLabel = formatTurnTokenCount(usage);
  const durationLabel = formatTurnDuration(
    getMessageTurnDurationMs(message, turnStartedAt),
  );

  const items = [
    tokensLabel
      ? {
          id: "tokens",
          node: <span data-testid="message-turn-tokens">{tokensLabel}</span>,
        }
      : null,
    durationLabel
      ? {
          id: "duration",
          node: (
            <span data-testid="message-turn-duration">{durationLabel}</span>
          ),
        }
      : null,
  ].filter((item): item is { id: string; node: JSX.Element } => item !== null);

  if (items.length === 0) {
    return null;
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground md:text-xs">
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 ? <span aria-hidden>·</span> : null}
          {item.node}
        </Fragment>
      ))}
    </span>
  );
}

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
  isReadonly = false,
  turnUsage,
  turnStartedAt,
  setMode,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  isReadonly?: boolean;
  turnUsage?: AppUsage;
  turnStartedAt?: string;
  setMode?: (mode: "view" | "edit") => void;
}) {
  const { mutate } = useSWRConfig();
  const [_, copyToClipboard] = useCopyToClipboard();

  if (isLoading) {
    return null;
  }

  const textFromParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const handleCopy = async () => {
    if (!textFromParts) {
      toast({
        type: "error",
        description: "There's no text to copy!",
      });
      return;
    }

    try {
      await copyToClipboard(textFromParts);
      toast({
        type: "success",
        description: "Copied to clipboard!",
      });
    } catch {
      // Fallback for browsers that don't support clipboard API
      if (
        typeof window !== "undefined" &&
        document.queryCommandSupported?.("copy")
      ) {
        const textArea = document.createElement("textarea");
        textArea.value = textFromParts;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          toast({
            type: "success",
            description: "Copied to clipboard!",
          });
        } catch {
          toast({
            type: "error",
            description: "Copy to clipboard is not supported in this browser",
          });
        } finally {
          document.body.removeChild(textArea);
        }
      } else {
        toast({
          type: "error",
          description: "Copy to clipboard is not supported in this browser",
        });
      }
    }
  };

  // User messages get edit (on hover) and copy actions
  if (message.role === "user") {
    return (
      <Actions className="justify-end">
        <div className="relative">
          {setMode && (
            <Action
              className="-left-10 absolute top-0 opacity-100 transition-opacity md:opacity-0 md:group-hover/message:opacity-100 md:focus-visible:opacity-100"
              data-testid="message-edit-button"
              onClick={() => setMode("edit")}
              tooltip="Edit"
            >
              <PencilEditIcon />
            </Action>
          )}
          <Action
            className="opacity-100 transition-opacity md:opacity-0 md:group-hover/message:opacity-100 md:focus-visible:opacity-100"
            onClick={handleCopy}
            tooltip="Copy"
          >
            <CopyIcon />
          </Action>
        </div>
      </Actions>
    );
  }

  return (
    <Actions className="-ml-0.5">
      {isReadonly ? null : (
        <>
          <Action onClick={handleCopy} tooltip="Copy">
            <CopyIcon />
          </Action>

          <Action
            data-testid="message-upvote"
            disabled={vote?.isUpvoted}
            onClick={() => {
              const upvote = fetch("/api/vote", {
                method: "PATCH",
                body: JSON.stringify({
                  chatId,
                  messageId: message.id,
                  type: "up",
                }),
              });

              toast.promise(upvote, {
                loading: "Upvoting Response...",
                success: () => {
                  mutate<Vote[]>(
                    `/api/vote?chatId=${chatId}`,
                    (currentVotes) => {
                      if (!currentVotes) {
                        return [];
                      }

                      const votesWithoutCurrent = currentVotes.filter(
                        (currentVote) => currentVote.messageId !== message.id,
                      );

                      return [
                        ...votesWithoutCurrent,
                        {
                          chatId,
                          messageId: message.id,
                          isUpvoted: true,
                        },
                      ];
                    },
                    { revalidate: false },
                  );

                  return "Upvoted Response!";
                },
                error: "Failed to upvote response.",
              });
            }}
            tooltip="Upvote Response"
          >
            <ThumbUpIcon />
          </Action>

          <Action
            data-testid="message-downvote"
            disabled={vote && !vote.isUpvoted}
            onClick={() => {
              const downvote = fetch("/api/vote", {
                method: "PATCH",
                body: JSON.stringify({
                  chatId,
                  messageId: message.id,
                  type: "down",
                }),
              });

              toast.promise(downvote, {
                loading: "Downvoting Response...",
                success: () => {
                  mutate<Vote[]>(
                    `/api/vote?chatId=${chatId}`,
                    (currentVotes) => {
                      if (!currentVotes) {
                        return [];
                      }

                      const votesWithoutCurrent = currentVotes.filter(
                        (currentVote) => currentVote.messageId !== message.id,
                      );

                      return [
                        ...votesWithoutCurrent,
                        {
                          chatId,
                          messageId: message.id,
                          isUpvoted: false,
                        },
                      ];
                    },
                    { revalidate: false },
                  );

                  return "Downvoted Response!";
                },
                error: "Failed to downvote response.",
              });
            }}
            tooltip="Downvote Response"
          >
            <ThumbDownIcon />
          </Action>
        </>
      )}
      <MessageTurnMeta
        fallbackUsage={turnUsage}
        message={message}
        turnStartedAt={turnStartedAt}
      />
    </Actions>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.isReadonly !== nextProps.isReadonly) {
      return false;
    }
    if (
      prevProps.message.metadata?.createdAt !==
      nextProps.message.metadata?.createdAt
    ) {
      return false;
    }
    if (!equal(prevProps.message.parts, nextProps.message.parts)) {
      return false;
    }
    if (!equal(prevProps.turnUsage, nextProps.turnUsage)) {
      return false;
    }
    if (prevProps.turnStartedAt !== nextProps.turnStartedAt) {
      return false;
    }

    return true;
  },
);
