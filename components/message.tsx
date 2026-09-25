"use client";
import equal from "fast-deep-equal";
import { motion } from "framer-motion";
import { memo, useEffect, useState } from "react";
import { useAppPortal } from "@/components/portal/context";
import type { ProposeCustomPersonaResult } from "@/lib/ai/personas/interview";
import type { GetCurrentConfigToolResult } from "@/lib/ai/tools/get-current-config";
import type { ReadWebpageToolResult } from "@/lib/ai/tools/read-webpage";
import type { WebSearchToolResult } from "@/lib/ai/web-search";
import {
  collectToolParts,
  groupMessageParts,
} from "@/lib/chat/group-message-parts";
import { countMcpToolOutcomes } from "@/lib/chat/message-turn-meta";
import type { Vote } from "@/lib/db/schema";
import { resolveToolCallArguments } from "@/lib/mcp/format-tool-display";
import { isMcpToolEmptyResult } from "@/lib/mcp/tool-empty";
import { getMcpToolError } from "@/lib/mcp/tool-error";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { cn, sanitizeText } from "@/lib/utils";
import { McpAppHost, type McpAppLaunch } from "./mcp-app-host";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageContent } from "./message-elements/message";
import { Response } from "./message-elements/response";
import { MessageReasoning } from "./message-reasoning";
import { MessageTool } from "./message-tool";
import { MessageTurnUsage } from "./message-turn-usage";
import { type SkillChip, ThinkingIndicator } from "./thinking-indicator";
import { GetCurrentConfigToolOutput } from "./tool-outputs/get-current-config-tool-output";
import { McpToolOutput } from "./tool-outputs/mcp-tool-output";
import { ProposeCustomPersonaToolOutput } from "./tool-outputs/propose-custom-persona-tool-output";
import { ReadWebpageToolOutput } from "./tool-outputs/read-webpage-tool-output";
import { WebSearchToolOutput } from "./tool-outputs/web-search-tool-output";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { UserMessageTextWithSkillBadges } from "./user-message-text-with-skill-badges";

type SetMessagesFn = (
  messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
) => void;
type RegenerateFn = () => Promise<void>;

function extractMcpAppLaunch(output: unknown): McpAppLaunch | null {
  if (!output || typeof output !== "object") {
    return null;
  }
  const record = output as {
    success?: boolean;
    result?: unknown;
    ui?: {
      resourceUri?: string;
      toolName?: string;
      title?: string;
      input?: Record<string, unknown>;
    };
  };
  if (!record.ui?.resourceUri || !record.ui.toolName) {
    return null;
  }
  return {
    resourceUri: record.ui.resourceUri,
    toolName: record.ui.toolName,
    title: record.ui.title,
    input: record.ui.input,
    result: record.result,
  };
}

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  onMcpAppUserMessage,
  showThinking = false,
  activeSkills = [],
  turnUsage,
  turnStartedAt,
  turnSkills = [],
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: SetMessagesFn;
  regenerate: RegenerateFn;
  isReadonly: boolean;
  onMcpAppUserMessage?: (text: string) => void;
  showThinking?: boolean;
  activeSkills?: SkillChip[];
  turnUsage?: AppUsage;
  turnStartedAt?: string;
  turnSkills?: SkillChip[];
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [mcpAppLaunch, setMcpAppLaunch] = useState<McpAppLaunch | null>(null);
  const [autoOpenedToolIds, setAutoOpenedToolIds] = useState<Set<string>>(
    () => new Set(),
  );
  const { openPortal } = useAppPortal();

  // Auto-open MCP Apps when a tool with UI metadata completes
  useEffect(() => {
    if (isReadonly || !message.parts) {
      return;
    }
    for (const part of message.parts) {
      if (!part.type.startsWith("tool-ns_")) {
        continue;
      }
      const toolPart = part as {
        toolCallId?: string;
        state?: string;
        output?: unknown;
      };
      const toolCallId = toolPart.toolCallId;
      if (
        toolPart.state !== "output-available" ||
        !toolCallId ||
        autoOpenedToolIds.has(toolCallId)
      ) {
        continue;
      }
      const launch = extractMcpAppLaunch(toolPart.output);
      if (launch) {
        setAutoOpenedToolIds((prev) => new Set(prev).add(toolCallId));
        if (launch.toolName === "ns_prompt_library_app") {
          openPortal("prompts");
        } else {
          setMcpAppLaunch(launch);
        }
        break;
      }
    }
  }, [message.parts, isReadonly, autoOpenedToolIds, openPortal]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="group/message w-full"
      data-role={message.role}
      data-testid={`message-${message.role}`}
      initial={showThinking ? false : { opacity: 0 }}
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
          {showThinking ? <ThinkingIndicator skills={activeSkills} /> : null}
          {(() => {
            const renderPart = (
              part: NonNullable<ChatMessage["parts"]>[number],
              index: number,
            ) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (type === "data-invokedConnectedSkills") {
                return null;
              }

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

              if ((part as { type?: string }).type === "diffusion") {
                const diffusionPart = part as unknown as {
                  type: "diffusion";
                  text: string;
                };
                if (!diffusionPart.text?.trim().length) {
                  return null;
                }
                return (
                  <MessageReasoning
                    isLoading={false}
                    key={key}
                    reasoning={diffusionPart.text}
                  />
                );
              }

              if (type === "text") {
                // Check if text content is an error message (starts with **Error:**)
                const textContent = part.text || "";
                const isError = textContent.trim().startsWith("**Error:**");

                if (isError && message.role === "assistant") {
                  // Extract error message and details
                  // Remove **Error:** prefix first
                  const remainingText = textContent.replace(
                    /^\*\*Error:\*\*\s*/,
                    "",
                  );

                  // Check if there's a **Details:** section
                  const detailsMatch = remainingText.match(
                    /\n\n\*\*Details:\*\*\n(.+)$/s,
                  );
                  const errorDetails = detailsMatch?.[1]?.trim();

                  // Get the error message (everything before **Details:** or the whole thing)
                  let errorMessage = remainingText;
                  if (detailsMatch) {
                    errorMessage = remainingText
                      .substring(0, detailsMatch.index)
                      .trim();
                  } else {
                    errorMessage = remainingText.trim();
                  }

                  // Fallback if extraction failed
                  if (!errorMessage || errorMessage.length === 0) {
                    errorMessage = textContent
                      .replace(/\*\*Error:\*\*\s*/, "")
                      .trim();
                  }

                  return (
                    <Card
                      className="w-full border-destructive/50 bg-destructive/10 dark:bg-destructive/20"
                      key={key}
                    >
                      <CardContent className="p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <h4 className="font-semibold text-destructive dark:text-red-400">
                            Error
                          </h4>
                        </div>
                        <div className="space-y-2">
                          <div className="wrap-break-word text-sm text-destructive dark:text-red-300">
                            {errorMessage}
                          </div>
                          {errorDetails && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                Show details
                              </summary>
                              <pre className="mt-2 wrap-break-word whitespace-pre-wrap text-xs text-destructive/90 dark:text-red-200">
                                {errorDetails}
                              </pre>
                            </details>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                }

                // Regular text rendering
                if (mode === "view") {
                  if (message.role === "user") {
                    const invokedSlugs = new Set(
                      (message.parts ?? []).flatMap((messagePart) => {
                        if (
                          messagePart.type !== "data-invokedConnectedSkills"
                        ) {
                          return [];
                        }
                        return messagePart.data.map((skill) =>
                          skill.slug.toLowerCase(),
                        );
                      }),
                    );

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
                            <UserMessageTextWithSkillBadges
                              invokedSlugs={invokedSlugs}
                              text={part.text}
                            />
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

              if (
                type === "tool-searchNetsuiteDocs" ||
                (typeof type === "string" && type.startsWith("tool-searchWeb_"))
              ) {
                const toolPart = part as {
                  type: string;
                  toolCallId: string;
                  state:
                    | "input-streaming"
                    | "input-available"
                    | "output-available"
                    | "output-error";
                  input: { query: string; maxResults?: number };
                  output?: WebSearchToolResult | { error: string };
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
                        <WebSearchToolOutput
                          result={toolPart.output as WebSearchToolResult}
                        />
                      ) : null
                    }
                    state={state}
                    toolCallId={toolCallId}
                    type={type as `tool-${string}`}
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

              if (type === "tool-proposeCustomPersona") {
                const toolPart = part as {
                  type: string;
                  toolCallId: string;
                  state:
                    | "input-streaming"
                    | "input-available"
                    | "output-available"
                    | "output-error";
                  input: Record<string, unknown>;
                  output?: ProposeCustomPersonaResult;
                };
                const { toolCallId, state } = toolPart;
                return (
                  <MessageTool
                    input={toolPart.input}
                    key={toolCallId}
                    output={
                      toolPart.output ? (
                        <ProposeCustomPersonaToolOutput
                          chatId={chatId}
                          onRevise={(feedback) => {
                            onMcpAppUserMessage?.(feedback);
                          }}
                          onSaved={(payload) => {
                            // Soft convert without full reload (avoids Streamdown hydration flash)
                            if (typeof window !== "undefined") {
                              window.dispatchEvent(
                                new CustomEvent("persona-saved", {
                                  detail: payload,
                                }),
                              );
                            }
                          }}
                          result={toolPart.output}
                        />
                      ) : null
                    }
                    state={state}
                    toolCallId={toolCallId}
                    type="tool-proposeCustomPersona"
                  />
                );
              }

              if (type === "tool-updatePersonaInterview") {
                const toolPart = part as {
                  type: string;
                  toolCallId: string;
                  state:
                    | "input-streaming"
                    | "input-available"
                    | "output-available"
                    | "output-error";
                  input: Record<string, unknown>;
                  output?: {
                    ok?: boolean;
                    covered?: string[];
                    missing?: string[];
                    complete?: boolean;
                  };
                };
                const { toolCallId, state } = toolPart;
                const covered = toolPart.output?.covered?.length ?? 0;
                return (
                  <MessageTool
                    input={toolPart.input}
                    key={toolCallId}
                    output={
                      toolPart.output ? (
                        <div className="rounded-md border p-2 text-muted-foreground text-xs">
                          Interview progress: {covered}/7
                          {toolPart.output.complete
                            ? " — ready to propose"
                            : toolPart.output.missing?.length
                              ? ` · still need ${toolPart.output.missing.join(", ")}`
                              : ""}
                        </div>
                      ) : null
                    }
                    state={state}
                    toolCallId={toolCallId}
                    type="tool-updatePersonaInterview"
                  />
                );
              }

              // Handle NetSuite MCP tools (tools starting with "tool-ns_")
              if (type === "dynamic-tool") {
                // Recorded by an agent working in another system. Shown with
                // the same card as this app's own tools, and deliberately not
                // through their bespoke branches: the output shape is whatever
                // that system returned, and it has not been through NetSuite.
                const recorded = part as unknown as {
                  toolName: string;
                  toolCallId: string;
                  state:
                    | "input-streaming"
                    | "input-available"
                    | "output-available"
                    | "output-error";
                  input?: unknown;
                  output?: unknown;
                  errorText?: string;
                };

                return (
                  <MessageTool
                    errorText={recorded.errorText}
                    input={recorded.input}
                    key={recorded.toolCallId}
                    output={
                      recorded.output === undefined ||
                      recorded.output === null ? null : (
                        <McpToolOutput
                          output={recorded.output}
                          toolName={recorded.toolName}
                        />
                      )
                    }
                    state={recorded.state}
                    toolCallId={recorded.toolCallId}
                    type={`tool-${recorded.toolName}` as `tool-${string}`}
                  />
                );
              }

              if (type.startsWith("tool-ns_")) {
                // Type assertion for dynamic NetSuite tools
                const toolPart = part as {
                  type: string;
                  toolCallId: string;
                  state: "input-available" | "output-available";
                  input?: unknown;
                  args?: unknown;
                  arguments?: unknown;
                  output?: unknown;
                };
                const appLaunch = extractMcpAppLaunch(toolPart.output);
                const callArguments = resolveToolCallArguments(toolPart);
                const payloadError = getMcpToolError(toolPart.output);
                const emptyResult =
                  !payloadError &&
                  toolPart.state === "output-available" &&
                  isMcpToolEmptyResult(toolPart.output);

                return (
                  <MessageTool
                    emptyResult={emptyResult}
                    errorText={payloadError}
                    input={callArguments}
                    key={toolPart.toolCallId}
                    output={
                      <div className="space-y-2">
                        {appLaunch && !payloadError ? (
                          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
                            <p className="text-muted-foreground text-xs">
                              Interactive NetSuite app ready
                            </p>
                            <Button
                              onClick={() => setMcpAppLaunch(appLaunch)}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Open
                            </Button>
                          </div>
                        ) : null}
                        {toolPart.output === undefined ||
                        toolPart.output === null ? null : (
                          <McpToolOutput
                            output={toolPart.output}
                            toolName={toolPart.type.replace(/^tool-/, "")}
                          />
                        )}
                      </div>
                    }
                    state={toolPart.state}
                    toolCallId={toolPart.toolCallId}
                    type={toolPart.type as `tool-${string}`}
                  />
                );
              }

              return null;
            };

            const groupedParts = groupMessageParts(message.parts);
            const toolItems = collectToolParts(message.parts);
            const toolOutcomes = countMcpToolOutcomes(
              toolItems.map((item) => item.part),
            );

            return (
              <>
                {groupedParts.map((group) => {
                  if (group.kind === "tools") {
                    return null;
                  }
                  return renderPart(group.part, group.index);
                })}
                {message.role === "assistant" ? (
                  <MessageTurnUsage
                    emptyToolCount={toolOutcomes.empty}
                    failedToolCount={toolOutcomes.failed}
                    skills={turnSkills}
                    succeededToolCount={toolOutcomes.succeeded}
                    toolCount={toolOutcomes.total}
                  >
                    {toolItems.map((item) => renderPart(item.part, item.index))}
                  </MessageTurnUsage>
                ) : null}
              </>
            );
          })()}

          {(message.role === "assistant" || !isReadonly) && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              isReadonly={isReadonly}
              key={`action-${message.id}`}
              message={message}
              setMode={setMode}
              turnStartedAt={turnStartedAt}
              turnUsage={turnUsage}
              vote={vote}
            />
          )}
        </div>
      </div>

      <McpAppHost
        launch={
          mcpAppLaunch?.toolName === "ns_prompt_library_app"
            ? null
            : mcpAppLaunch
        }
        onOpenChange={(next) => {
          if (!next) {
            setMcpAppLaunch(null);
          }
        }}
        onUserMessage={onMcpAppUserMessage}
      />
    </motion.div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.isReadonly !== nextProps.isReadonly) {
      return false;
    }
    if (prevProps.showThinking !== nextProps.showThinking) {
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
    if (!equal(prevProps.activeSkills, nextProps.activeSkills)) {
      return false;
    }
    if (!equal(prevProps.turnUsage, nextProps.turnUsage)) {
      return false;
    }
    if (prevProps.turnStartedAt !== nextProps.turnStartedAt) {
      return false;
    }
    if (!equal(prevProps.turnSkills, nextProps.turnSkills)) {
      return false;
    }
    if (
      prevProps.message.metadata?.createdAt !==
      nextProps.message.metadata?.createdAt
    ) {
      return false;
    }

    return true;
  },
);

export const ThinkingMessage = ({ skills = [] }: { skills?: SkillChip[] }) => (
  <div
    className="group/message w-full"
    data-testid="message-assistant-loading-shell"
  >
    <div className="flex w-full min-w-0 items-start justify-start gap-2 md:gap-3">
      <div className="mt-0 flex min-w-0 w-full flex-col gap-2">
        <ThinkingIndicator skills={skills} />
      </div>
    </div>
  </div>
);
