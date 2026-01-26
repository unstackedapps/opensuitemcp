"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Trigger } from "@radix-ui/react-select";
import {
  type Dispatch,
  memo,
  type SetStateAction,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import { useWindowSize } from "usehooks-ts";
import { saveChatModelAsCookie } from "@/app/(chat)/actions";
import { SelectItem } from "@/components/ui/select";
import { chatModels } from "@/lib/ai/models";
import { myProvider } from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import {
  ArrowUpIcon,
  BrainIcon,
  ChevronDownIcon,
  StopIcon,
  StopwatchFastIcon,
} from "./icons";
import { Context } from "./message-elements/context";
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./message-elements/prompt-input";
import { toast } from "./toast";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
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
  usage,
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
  usage?: AppUsage;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [mounted, setMounted] = useState(false);

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

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      <PromptInput
        className="rounded-3xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
        onSubmit={(event) => {
          event.preventDefault();
          if (status !== "ready") {
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
            maxHeight={200}
            minHeight={44}
            onChange={handleInput}
            placeholder="Ask me about your NetSuite data"
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
            <ModelSelectorCompact
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
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
                disabled={!input.trim()}
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

    return true;
  },
);

async function fetchSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    return { aiProvider: "google" as const };
  }
  const data = await response.json();
  return {
    aiProvider: (data.aiProvider || "google") as "google" | "anthropic",
  };
}

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [optimisticModelId, setOptimisticModelId] = useState(selectedModelId);
  const [mounted, setMounted] = useState(false);

  // Fetch user's provider setting
  const { data: settings } = useSWR("settings", fetchSettings, {
    fallbackData: { aiProvider: "google" as const },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOptimisticModelId(selectedModelId);
  }, [selectedModelId]);

  // Get available models for current provider
  const provider = settings?.aiProvider || "google";
  const availableModels = chatModels.filter(
    (model) => !model.provider || model.provider === provider,
  );
  const speedModel = availableModels.find((m) => m.id === "chat-model");
  const reasoningModel = availableModels.find(
    (m) => m.id === "chat-model-reasoning",
  );

  const handleModelChange = (newModelId: string) => {
    // Use availableModels (filtered by provider) instead of full chatModels array
    const model = availableModels.find((m) => m.id === newModelId);
    const modelName = model?.name || newModelId;
    console.log("[ModelSelector] Model changed:", {
      newModelId,
      modelName,
      provider,
      availableModels: availableModels.map((m) => ({ id: m.id, name: m.name })),
    });
    toast({
      type: "success",
      description: `Switched to ${modelName}`,
    });
    setOptimisticModelId(newModelId);
    onModelChange?.(newModelId);
    startTransition(() => {
      saveChatModelAsCookie(newModelId);
    });
  };

  const currentIsReasoning = optimisticModelId === "chat-model-reasoning";
  const currentModel = currentIsReasoning ? reasoningModel : speedModel;

  // Only render Select after mount to avoid hydration issues with Chrome extensions
  if (!mounted || !speedModel || !reasoningModel) {
    return (
      <Button className="h-8 px-2" variant="ghost">
        {currentIsReasoning ? (
          <BrainIcon size={16} />
        ) : (
          <StopwatchFastIcon size={16} />
        )}
        <span className="font-medium text-xs">
          {currentModel?.name || (currentIsReasoning ? "Reasoning" : "Speed")}
        </span>
        <ChevronDownIcon size={16} />
      </Button>
    );
  }

  return (
    <PromptInputModelSelect
      onValueChange={(value) => {
        handleModelChange(value);
      }}
      value={optimisticModelId}
    >
      <Trigger asChild>
        <Button className="h-8 px-2" variant="ghost">
          {currentIsReasoning ? (
            <BrainIcon size={16} />
          ) : (
            <StopwatchFastIcon size={16} />
          )}
          <span className="font-medium text-xs">
            {currentModel?.name || (currentIsReasoning ? "Reasoning" : "Speed")}
          </span>
          <ChevronDownIcon size={16} />
        </Button>
      </Trigger>
      <PromptInputModelSelectContent className="min-w-[180px] p-0">
        <div className="flex flex-col gap-px">
          <SelectItem value={speedModel.id}>
            <div className="flex items-center gap-2">
              <StopwatchFastIcon size={16} />
              <div className="truncate font-medium text-xs">
                {speedModel.name}
              </div>
            </div>
            <div className="mt-px truncate text-[10px] text-muted-foreground leading-tight">
              {speedModel.description}
            </div>
          </SelectItem>
          <SelectItem value={reasoningModel.id}>
            <div className="flex items-center gap-2">
              <BrainIcon size={16} />
              <div className="truncate font-medium text-xs">
                {reasoningModel.name}
              </div>
            </div>
            <div className="mt-px truncate text-[10px] text-muted-foreground leading-tight">
              {reasoningModel.description}
            </div>
          </SelectItem>
        </div>
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

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
