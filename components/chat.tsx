"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatHeader } from "@/components/chat-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { InfoIcon } from "./icons";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import type { VisibilityType } from "./visibility-selector";

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
  initialLastContext,
  initialMaxIterationsReached = false,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  initialLastContext?: AppUsage;
  initialMaxIterationsReached?: boolean;
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();

  const [input, setInput] = useState<string>("");
  const [usage, setUsage] = useState<AppUsage | undefined>(initialLastContext);
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [maxIterationsReached, setMaxIterationsReached] = useState(
    initialMaxIterationsReached,
  );
  const currentModelIdRef = useRef(currentModelId);
  const errorOccurredRef = useRef(false);

  // Update refs when values change (these are used inside transport callbacks)
  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  const visibilityTypeRef = useRef(visibilityType);
  useEffect(() => {
    visibilityTypeRef.current = visibilityType;
  }, [visibilityType]);

  // Create transport once - it never changes, preventing useChat from reinitializing
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: fetchWithErrorHandlers,
        prepareSendMessagesRequest(request) {
          return {
            body: {
              id: request.id,
              message: request.messages.at(-1),
              selectedChatModel: currentModelIdRef.current,
              selectedVisibilityType: visibilityTypeRef.current,
              ...request.body,
            },
          };
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport,
    onData: (dataPart) => {
      if (dataPart.type === "data-usage") {
        setUsage(dataPart.data);
      }
    },
    onFinish: async () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
      // Check if maxIterationsReached flag was set after stream completes.
      // Brief delay so server's onFinish has time to write the flag (avoids race).
      try {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const response = await fetch(`/api/chat/${id}`);
        if (response.ok) {
          const chatData = await response.json();
          if (chatData?.maxIterationsReached) {
            setMaxIterationsReached(true);
          }
        }
      } catch (error) {
        console.warn(
          "[Chat] Failed to check maxIterationsReached flag:",
          error,
        );
      }
    },
    onError: (error) => {
      // Mark that an error occurred
      errorOccurredRef.current = true;

      // Stop the stream immediately to reset the status
      stop();

      // Prevent error from propagating to Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.preventDefault) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).preventDefault();
      }

      // Extract error message and details
      let errorMessage = "An error occurred";
      let errorDetails: string | null = null;

      if (error instanceof Error) {
        errorMessage = error.message || error.toString();

        // Check if it's an API call error with response body
        if ("responseBody" in error && typeof error.responseBody === "string") {
          try {
            const errorBody = JSON.parse(error.responseBody);
            if (errorBody?.error?.message) {
              errorMessage = errorBody.error.message;
              if (errorBody.error?.param) {
                errorDetails = `Parameter: ${errorBody.error.param}`;
              }
              if (errorBody.error?.code) {
                errorDetails = errorDetails
                  ? `${errorDetails}, Code: ${errorBody.error.code}`
                  : `Code: ${errorBody.error.code}`;
              }
            }
          } catch {
            errorDetails = error.responseBody;
          }
        }

        if ("statusCode" in error && error.statusCode) {
          errorDetails = errorDetails
            ? `${errorDetails}, Status: ${error.statusCode}`
            : `Status: ${error.statusCode}`;
        }
      } else {
        errorMessage = String(error);
      }

      // Add error as an assistant message in the chat
      const errorMessageText = errorDetails
        ? `**Error:** ${errorMessage}\n\n**Details:**\n${errorDetails}`
        : `**Error:** ${errorMessage}`;

      // Replace any empty assistant message with the error message
      // This prevents empty messages from appearing
      setMessages((prevMessages) => {
        // Find the last assistant message (which is likely the empty one created by the SDK)
        const lastAssistantIndex = prevMessages.findLastIndex(
          (msg) => msg.role === "assistant",
        );

        if (lastAssistantIndex !== -1) {
          const lastAssistant = prevMessages[lastAssistantIndex];
          // Check if it's empty (no parts or only empty text)
          const isEmpty =
            !lastAssistant.parts ||
            lastAssistant.parts.length === 0 ||
            !lastAssistant.parts.some((part) => {
              if (part.type === "text") {
                return part.text && part.text.trim().length > 0;
              }
              return true; // Non-text parts are considered valid
            });

          if (isEmpty) {
            // Replace the empty message with the error message
            const updatedMessages = [...prevMessages];
            updatedMessages[lastAssistantIndex] = {
              ...lastAssistant,
              parts: [
                {
                  type: "text",
                  text: errorMessageText,
                },
              ],
            };
            return updatedMessages;
          }
        }

        // If no empty assistant message found, add error as new message
        return [
          ...prevMessages,
          {
            id: generateUUID(),
            role: "assistant",
            parts: [
              {
                type: "text",
                text: errorMessageText,
              },
            ],
            createdAt: new Date(),
          },
        ];
      });

      if (error instanceof ChatSDKError) {
        // Check if it's a credit card error
        if (
          error.message?.includes("AI Gateway requires a valid credit card")
        ) {
          setShowCreditCardAlert(true);
        }
      }

      // Call stop again after state updates to ensure status resets
      setTimeout(() => {
        stop();
      }, 0);

      // Return false to prevent SDK from re-throwing
      return false;
    },
  });

  // Reset error flag when a new message is submitted (status becomes "submitted")
  // This ensures the error state doesn't interfere with the next message
  useEffect(() => {
    if (status === "submitted" && errorOccurredRef.current) {
      // A new message was sent, reset the error flag
      errorOccurredRef.current = false;
    }
    if (status === "ready" && errorOccurredRef.current) {
      // Also reset when status becomes ready (fallback)
      errorOccurredRef.current = false;
    }
  }, [status]);

  const searchParams = useSearchParams();
  const query = searchParams.get("query");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (!query || hasAppendedQuery) return;
    // Do not send query-param message when thread is locked or stream is active
    if (
      maxIterationsReached ||
      status === "streaming" ||
      status === "submitted"
    ) {
      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
      return;
    }
    sendMessage({
      role: "user" as const,
      parts: [{ type: "text", text: query }],
    });
    setHasAppendedQuery(true);
    window.history.replaceState({}, "", `/chat/${id}`);
  }, [query, sendMessage, hasAppendedQuery, id, maxIterationsReached, status]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
  });

  // Catch unhandled errors that might not be caught by SDK
  // BUT only catch errors related to chat/stream processing, not general system errors
  useEffect(() => {
    const isChatRelatedError = (error: Error | string): boolean => {
      const errorString =
        error instanceof Error ? error.stack || error.message : String(error);

      // Check if error is from chat/stream related code
      const chatRelatedPatterns = [
        /process-ui-message-stream/i,
        /chat\.ts/i,
        /useChat/i,
        /streamText/i,
        /toUIMessageStream/i,
        /ai-sdk/i,
        /@ai-sdk/i,
        /\/api\/chat/i,
        /AI_APICallError/i,
        /AI_UIMessageStreamError/i,
        /responseBody/i,
        /api\.openai\.com/i,
        /api\.anthropic\.com/i,
        /generativeai\.googleapis\.com/i,
      ];

      return chatRelatedPatterns.some((pattern) => pattern.test(errorString));
    };

    const handleError = (event: ErrorEvent) => {
      // Only handle chat-related errors
      if (event.error instanceof Error && isChatRelatedError(event.error)) {
        // Suppress Next.js error logging for chat errors
        event.preventDefault();

        const errorMessage = event.error.message;
        if (errorMessage) {
          setMessages((prevMessages) => [
            ...prevMessages,
            {
              id: generateUUID(),
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: `**Error:** ${errorMessage}`,
                },
              ],
              createdAt: new Date(),
            },
          ]);
        }
      }
      // For non-chat errors, let them propagate normally (don't preventDefault)
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      // Only handle chat-related errors
      if (event.reason instanceof Error && isChatRelatedError(event.reason)) {
        // Suppress Next.js error logging for chat errors
        event.preventDefault();

        const errorMessage = event.reason.message;
        if (errorMessage) {
          setMessages((prevMessages) => [
            ...prevMessages,
            {
              id: generateUUID(),
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: `**Error:** ${errorMessage}`,
                },
              ],
              createdAt: new Date(),
            },
          ]);
        }
      } else if (
        typeof event.reason === "string" &&
        isChatRelatedError(event.reason)
      ) {
        event.preventDefault();
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: generateUUID(),
            role: "assistant",
            parts: [
              {
                type: "text",
                text: `**Error:** ${event.reason}`,
              },
            ],
            createdAt: new Date(),
          },
        ]);
      }
      // For non-chat errors, let them propagate normally (don't preventDefault)
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [setMessages]);

  return (
    <>
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col bg-background">
        <ChatHeader
          chatId={id}
          isReadonly={isReadonly}
          selectedVisibilityType={initialVisibilityType}
        />

        <Messages
          chatId={id}
          inputComponent={
            !isReadonly && messages.length === 0 ? (
              <MultimodalInput
                chatId={id}
                disabled={maxIterationsReached}
                input={input}
                key={id}
                onModelChange={setCurrentModelId}
                selectedModelId={currentModelId}
                selectedVisibilityType={visibilityType}
                sendMessage={sendMessage}
                setInput={setInput}
                setMessages={setMessages}
                status={status}
                stop={stop}
                usage={usage}
              />
            ) : undefined
          }
          isReadonly={isReadonly}
          messages={messages}
          regenerate={regenerate}
          selectedModelId={initialChatModel}
          setMessages={setMessages}
          status={status}
          votes={votes}
        />

        {messages.length > 0 && (
          <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl flex-col gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
            {maxIterationsReached && !isReadonly && (
              <Card className="w-full border-blue-500/50 bg-blue-500/10 dark:bg-blue-500/20">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="text-blue-600 dark:text-blue-400">
                      <InfoIcon size={16} />
                    </div>
                    <h4 className="font-semibold text-blue-600 dark:text-blue-400">
                      Information
                    </h4>
                  </div>
                  <div className="space-y-3">
                    <div className="wrap-break-word text-sm text-blue-700 dark:text-blue-300">
                      I've reached the maximum number of reasoning steps allowed
                      for this response. What would you like to do?
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        onClick={async () => {
                          // Clear the flag
                          await fetch(`/api/chat/${id}/max-iterations`, {
                            method: "POST",
                          });
                          setMaxIterationsReached(false);
                          // Send auto message
                          sendMessage({
                            role: "user",
                            parts: [
                              {
                                type: "text",
                                text: "Please search NetSuite web resources to help you better understand the steps to take, then please try again.",
                              },
                            ],
                          });
                        }}
                        size="sm"
                        variant="default"
                      >
                        Check NetSuite KB and continue
                      </Button>
                      <Button
                        onClick={async () => {
                          // Clear the flag
                          await fetch(`/api/chat/${id}/max-iterations`, {
                            method: "POST",
                          });
                          setMaxIterationsReached(false);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        No, I'm fine
                      </Button>
                      <Button
                        onClick={async () => {
                          // Clear the flag
                          await fetch(`/api/chat/${id}/max-iterations`, {
                            method: "POST",
                          });
                          setMaxIterationsReached(false);
                          // Send auto message
                          sendMessage({
                            role: "user",
                            parts: [
                              {
                                type: "text",
                                text: "Please continue and try to answer my question.",
                              },
                            ],
                          });
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        Brute force it
                      </Button>
                    </div>
                    <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
                      You can change this limit in Settings under AI Provider →
                      Max Reasoning Steps.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            {!isReadonly && (
              <MultimodalInput
                chatId={id}
                disabled={maxIterationsReached}
                input={input}
                onModelChange={setCurrentModelId}
                selectedModelId={currentModelId}
                selectedVisibilityType={visibilityType}
                sendMessage={sendMessage}
                setInput={setInput}
                setMessages={setMessages}
                status={status}
                stop={stop}
                usage={usage}
              />
            )}
          </div>
        )}
      </div>

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate AI Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              This application requires{" "}
              {process.env.NODE_ENV === "production" ? "the owner" : "you"} to
              activate Vercel AI Gateway.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank",
                );
                window.location.href = "/";
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
