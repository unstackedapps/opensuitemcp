"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { BookOpen, Sparkles } from "lucide-react";
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWindowSize } from "usehooks-ts";
import { ComposerModelMenu } from "@/components/composer-model-menu";
import { NetSuiteAccountSwitcher } from "@/components/netsuite-account-switcher";
import { useAppPortal } from "@/components/portal/context";
import { myProvider } from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { ArrowUpIcon, StopIcon } from "./icons";
import { Context } from "./message-elements/context";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./message-elements/prompt-input";
import { toast } from "./toast";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import type { VisibilityType } from "./visibility-selector";

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType: _selectedVisibilityType,
  selectedModelId,
  onModelChange,
  aiProviderId = null,
  onAiProviderChange,
  usage,
  disabled = false,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  aiProviderId?: string | null;
  onAiProviderChange?: (id: string | null) => void;
  usage?: AppUsage;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [mounted, setMounted] = useState(false);
  const { openPortal, registerPromptHandler } = useAppPortal();

  useEffect(() => {
    setMounted(true);
  }, []);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  // Only access localStorage after mount to prevent hydration mismatch
  // Use a ref to track if we've synced to avoid accessing localStorage during render
  const hasSyncedFromStorageRef = useRef(false);

  useEffect(() => {
    if (mounted && !hasSyncedFromStorageRef.current) {
      try {
        const stored = localStorage.getItem("input");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed !== input) {
            setInput(parsed);
          }
        }
      } catch {
        // Ignore localStorage errors
      }
      hasSyncedFromStorageRef.current = true;
      adjustHeight();
    }
  }, [mounted, input, setInput, adjustHeight]);

  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem("input", JSON.stringify(input));
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [mounted, input]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const submitForm = useCallback(() => {
    window.history.pushState({}, "", `/chat/${chatId}`);

    sendMessage({
      role: "user",
      parts: [
        {
          type: "text",
          text: input,
        },
      ],
    });

    resetHeight();
    setInput("");

    // Clear localStorage after clearing input
    if (mounted) {
      try {
        localStorage.removeItem("input");
      } catch {
        // Ignore localStorage errors
      }
    }

    if (mounted && width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [input, setInput, sendMessage, width, chatId, resetHeight, mounted]);

  const _modelResolver = useMemo(() => {
    return myProvider.languageModel(selectedModelId);
  }, [selectedModelId]);

  const contextProps = useMemo(
    () => ({
      usage,
    }),
    [usage],
  );

  const openPromptLibrary = useCallback(() => {
    if (disabled) {
      toast({
        type: "error",
        description: "Connect NetSuite to use the prompt library.",
      });
      return;
    }
    openPortal("prompts");
  }, [disabled, openPortal]);

  const handleSelectPrompt = useCallback(
    (promptText: string) => {
      if (status === "streaming" || status === "submitted") {
        setInput(promptText);
        toast({
          type: "success",
          description: "Prompt loaded into the composer.",
        });
        return;
      }
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: promptText }],
      });
    },
    [sendMessage, setInput, status],
  );

  useEffect(() => {
    registerPromptHandler(handleSelectPrompt);
    return () => {
      registerPromptHandler(null);
    };
  }, [handleSelectPrompt, registerPromptHandler]);

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      <PromptInput
        className="rounded-3xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
        onSubmit={(event) => {
          event.preventDefault();
          // Only block if actively streaming - allow ready, error, and submitted states
          // (submitted after an error means the stream stopped but status hasn't reset yet)
          if (status === "streaming") {
            toast({
              type: "error",
              description: "Please wait for the model to finish its response!",
            });
          } else {
            submitForm();
          }
        }}
      >
        <div className="flex flex-row items-start gap-1 sm:gap-2">
          <PromptInputTextarea
            {...(mounted && { autoFocus: true })}
            className="grow resize-none border-0! border-none! bg-transparent p-2 text-sm outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
            data-testid="multimodal-input"
            disableAutoResize={true}
            disabled={disabled}
            maxHeight={200}
            minHeight={44}
            onChange={handleInput}
            placeholder="Ask Ava anything…"
            ref={(node) => {
              (
                textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>
              ).current = node;
            }}
            rows={1}
            value={input}
          />{" "}
          <Context {...contextProps} />
        </div>
        <PromptInputToolbar className="border-top-0! border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
          <PromptInputTools className="gap-0 sm:gap-0.5">
            <ComposerModelMenu
              aiProviderId={aiProviderId}
              chatId={chatId}
              onAiProviderChange={onAiProviderChange}
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
            <NetSuiteAccountSwitcher />
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Skills"
                    className="size-8 px-2"
                    onClick={() => openPortal("skills")}
                    type="button"
                    variant="ghost"
                  >
                    <Sparkles className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Skills</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Prompt Library"
                    className="size-8 px-2"
                    onClick={openPromptLibrary}
                    type="button"
                    variant="ghost"
                  >
                    <BookOpen className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Prompt Library</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </PromptInputTools>

          <div className="flex items-center gap-2">
            {(status === "submitted" || status === "streaming") && (
              <Spinner className="text-muted-foreground" />
            )}
            {status === "submitted" ? (
              <StopButton setMessages={setMessages} stop={stop} />
            ) : (
              <PromptInputSubmit
                className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
                data-testid="send-button"
                disabled={disabled || !input.trim()}
                status={status}
              >
                <ArrowUpIcon size={14} />
              </PromptInputSubmit>
            )}
          </div>
        </PromptInputToolbar>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }
    if (prevProps.aiProviderId !== nextProps.aiProviderId) {
      return false;
    }
    if (prevProps.disabled !== nextProps.disabled) {
      return false;
    }

    return true;
  },
);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
