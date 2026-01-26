"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { motion } from "framer-motion";
import { memo, useState } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import type { GetCurrentConfigToolResult } from "@/lib/ai/tools/get-current-config";
import type { ListSearchDomainsToolResult } from "@/lib/ai/tools/list-search-domains";
import type { ReadWebpageToolResult } from "@/lib/ai/tools/read-webpage";
import type { WebSearchToolResult } from "@/lib/ai/tools/web-search";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageContent } from "./message-elements/message";
import { Response } from "./message-elements/response";
import { MessageReasoning } from "./message-reasoning";
import { MessageTool } from "./message-tool";
import { GetCurrentConfigToolOutput } from "./tool-outputs/get-current-config-tool-output";
import { ListSearchDomainsToolOutput } from "./tool-outputs/list-search-domains-tool-output";
import { ReadWebpageToolOutput } from "./tool-outputs/read-webpage-tool-output";
import { WebSearchToolOutput } from "./tool-outputs/web-search-tool-output";
import { Card, CardContent } from "./ui/card";

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="group/message w-full"
      data-role={message.role}
      data-testid={`message-${message.role}`}
      initial={{ opacity: 0 }}
    >
      <div
        className={cn("flex w-full min-w-0 items-start gap-2 md:gap-3", {
          "justify-end": message.role === "user" && mode !== "edit",
          "justify-start": message.role === "assistant",
        })}
      >
        <div
          className={cn("mt-0 flex min-w-0 flex-col gap-2", {
            // Assistant messages (including pure tool outputs) and edit mode
            // should always use the full available width.
            "w-full": message.role === "assistant" || mode === "edit",
            // User messages stay constrained so they don't stretch edge-to-edge.
            "min-w-[50%] max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          })}
        >
          {message.parts?.map((part, index) => {
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === "reasoning" && part.text?.trim().length > 0) {
              // Find all reasoning parts to determine if this is the last one
              const reasoningParts =
                message.parts?.filter((p) => p.type === "reasoning") ?? [];
              const isLastReasoningPart =
                reasoningParts.length > 0 && reasoningParts.at(-1) === part;
              // Only the last reasoning part should show as streaming if message is loading
              const isReasoningStreaming = isLoading && isLastReasoningPart;

              return (
                <MessageReasoning
                  isLoading={isReasoningStreaming}
                  key={key}
                  reasoning={part.text}
                />
              );
            }

            if (type === "text") {
              if (mode === "view") {
                if (message.role === "user") {
                  return (
                    <Card
                      className="w-full rounded-tl-3xl rounded-tr rounded-br-3xl rounded-bl-3xl bg-sidebar text-sidebar-foreground shadow-none"
                      key={key}
                    >
                      <CardContent className="px-2 py-1">
                        <MessageContent
                          className="wrap-break-word text-left"
                          data-testid="message-content"
                        >
                          <Response>{sanitizeText(part.text)}</Response>
                        </MessageContent>
                      </CardContent>
                    </Card>
                  );
                }
                return (
                  <div key={key}>
                    <MessageContent
                      className={cn({
                        "bg-transparent px-0 py-0 text-left":
                          message.role === "assistant",
                      })}
                      data-testid="message-content"
                    >
                      <Response>{sanitizeText(part.text)}</Response>
                    </MessageContent>
                  </div>
                );
              }

              if (mode === "edit") {
                return (
                  <div
                    className="flex w-full flex-row items-start gap-3"
                    key={key}
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        regenerate={regenerate}
                        setMessages={setMessages}
                        setMode={setMode}
                      />
                    </div>
                  </div>
                );
              }
            }

            if (type === "tool-listSearchDomains") {
              const toolPart = part as Extract<
                ChatMessage["parts"][number],
                { type: "tool-listSearchDomains" }
              >;
              const { toolCallId, state } = toolPart;

              const hasError =
                toolPart.output &&
                typeof toolPart.output === "object" &&
                toolPart.output !== null &&
                "error" in toolPart.output;

              return (
                <MessageTool
                  errorText={
                    hasError
                      ? String(
                          (toolPart.output as unknown as { error: unknown })
                            .error,
                        )
                      : undefined
                  }
                  input={toolPart.input}
                  key={toolCallId}
                  output={
                    !hasError &&
                    toolPart.output &&
                    typeof toolPart.output === "object" ? (
                      <ListSearchDomainsToolOutput
                        result={toolPart.output as ListSearchDomainsToolResult}
                      />
                    ) : null
                  }
                  state={state}
                  toolCallId={toolCallId}
                  type="tool-listSearchDomains"
                />
              );
            }

            if (type === "tool-webSearch") {
              const toolPart = part as Extract<
                ChatMessage["parts"][number],
                { type: "tool-webSearch" }
              >;
              const { toolCallId, state } = toolPart;

              const hasError =
                toolPart.output &&
                typeof toolPart.output === "object" &&
                toolPart.output !== null &&
                "error" in toolPart.output;

              return (
                <MessageTool
                  errorText={
                    hasError
                      ? String(
                          (toolPart.output as unknown as { error: unknown })
                            .error,
                        )
                      : undefined
                  }
                  input={toolPart.input}
                  key={toolCallId}
                  output={
                    !hasError &&
                    toolPart.output &&
                    typeof toolPart.output === "object" ? (
                      <WebSearchToolOutput
                        result={toolPart.output as WebSearchToolResult}
                      />
                    ) : null
                  }
                  state={state}
                  toolCallId={toolCallId}
                  type="tool-webSearch"
                />
              );
            }

            if (type === "tool-readWebpage") {
              const toolPart = part as {
                type: string;
                toolCallId: string;
                state:
                  | "input-streaming"
                  | "input-available"
                  | "output-available"
                  | "output-error";
                input: { url: string };
                output?: ReadWebpageToolResult | { error: string };
              };
              const { toolCallId, state } = toolPart;

              const hasError =
                toolPart.output &&
                typeof toolPart.output === "object" &&
                toolPart.output !== null &&
                "error" in toolPart.output;

              return (
                <MessageTool
                  errorText={
                    hasError
                      ? String(
                          (toolPart.output as unknown as { error: unknown })
                            .error,
                        )
                      : undefined
                  }
                  input={toolPart.input}
                  key={toolCallId}
                  output={
                    !hasError &&
                    toolPart.output &&
                    typeof toolPart.output === "object" ? (
                      <ReadWebpageToolOutput
                        result={toolPart.output as ReadWebpageToolResult}
                      />
                    ) : null
                  }
                  state={state}
                  toolCallId={toolCallId}
                  type="tool-readWebpage"
                />
              );
            }

            if (type === "tool-getCurrentConfig") {
              const toolPart = part as {
                type: string;
                toolCallId: string;
                state:
                  | "input-streaming"
                  | "input-available"
                  | "output-available"
                  | "output-error";
                input: Record<string, never>;
                output?: GetCurrentConfigToolResult | { error: string };
              };
              const { toolCallId, state } = toolPart;

              const hasError =
                toolPart.output &&
                typeof toolPart.output === "object" &&
                toolPart.output !== null &&
                "error" in toolPart.output;

              return (
                <MessageTool
                  errorText={
                    hasError
                      ? String(
                          (toolPart.output as unknown as { error: unknown })
                            .error,
                        )
                      : undefined
                  }
                  input={toolPart.input}
                  key={toolCallId}
                  output={
                    !hasError &&
                    toolPart.output &&
                    typeof toolPart.output === "object" ? (
                      <GetCurrentConfigToolOutput
                        result={toolPart.output as GetCurrentConfigToolResult}
                      />
                    ) : null
                  }
                  state={state}
                  toolCallId={toolCallId}
                  type="tool-getCurrentConfig"
                />
              );
            }

            // Handle NetSuite MCP tools (tools starting with "tool-ns_")
            if (type.startsWith("tool-ns_")) {
              // Type assertion for dynamic NetSuite tools
              const toolPart = part as {
                type: string;
                toolCallId: string;
                state: "input-available" | "output-available";
                input?: unknown;
                output?: unknown;
              };

              return (
                <MessageTool
                  errorText={
                    toolPart.output &&
                    typeof toolPart.output === "object" &&
                    toolPart.output !== null &&
                    "error" in toolPart.output
                      ? String(toolPart.output.error)
                      : undefined
                  }
                  input={toolPart.input}
                  key={toolPart.toolCallId}
                  output={
                    toolPart.output &&
                    typeof toolPart.output === "object" &&
                    toolPart.output !== null &&
                    "error" in toolPart.output ? (
                      <div className="rounded border p-2 text-red-500">
                        Error: {String(toolPart.output.error)}
                      </div>
                    ) : toolPart.output &&
                      typeof toolPart.output === "object" &&
                      toolPart.output !== null &&
                      "success" in toolPart.output &&
                      "result" in toolPart.output ? (
                      <pre className="wrap-break-word overflow-x-auto whitespace-pre-wrap text-xs">
                        {JSON.stringify(
                          (toolPart.output as { result: unknown }).result,
                          null,
                          2,
                        )}
                      </pre>
                    ) : toolPart.output ? (
                      <pre className="wrap-break-word overflow-x-auto whitespace-pre-wrap text-xs">
                        {JSON.stringify(toolPart.output, null, 2)}
                      </pre>
                    ) : null
                  }
                  state={toolPart.state}
                  toolCallId={toolPart.toolCallId}
                  type={toolPart.type as `tool-${string}`}
                />
              );
            }

            return null;
          })}

          {!isReadonly && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              key={`action-${message.id}`}
              message={message}
              setMode={setMode}
              vote={vote}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.message.id !== nextProps.message.id) {
      return false;
    }
    if (!equal(prevProps.message.parts, nextProps.message.parts)) {
      return false;
    }
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }

    return false;
  },
);

export const ThinkingMessage = () => {
  const { state: sidebarState, isMobile } = useSidebar();
  const isSidebarOpen = sidebarState === "expanded" && !isMobile;

  return (
    <div
      className="pointer-events-none fixed top-1/2 right-0 left-0 z-50 transition-[left] duration-200 ease-linear"
      data-testid="message-assistant-loading"
      style={{
        left: isSidebarOpen ? "var(--sidebar-width, 20rem)" : "0",
      }}
    >
      <div className="mx-auto flex max-w-4xl justify-center px-2 md:px-4">
        <div className="-translate-y-1/2 flex items-center gap-2">
          <span
            className="size-3 animate-smooth-bounce rounded-full bg-blue-500"
            style={{
              animationDelay: "0ms",
            }}
          />
          <span
            className="size-3 animate-smooth-bounce rounded-full bg-orange-600"
            style={{
              animationDelay: "200ms",
            }}
          />
          <span
            className="size-3 animate-smooth-bounce rounded-full bg-black dark:bg-white"
            style={{
              animationDelay: "400ms",
            }}
          />
        </div>
      </div>
    </div>
  );
};
