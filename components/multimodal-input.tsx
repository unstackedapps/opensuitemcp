"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Trigger } from "@radix-ui/react-select";
import { BookOpen, Sparkles } from "lucide-react";
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
import { AiProviderSwitcher } from "@/components/ai-provider-switcher";
import { useAppPortal } from "@/components/portal/context";
import { SelectItem } from "@/components/ui/select";
import { chatModels } from "@/lib/ai/models";
import {
  type AiProviderConfig,
  findProviderById,
  isMultiAiProviders,
  parseAiProviderConfig,
} from "@/lib/ai/provider-entries";
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
            <AiProviderSwitcher
              aiProviderId={aiProviderId}
              chatId={chatId}
              onAiProviderChange={onAiProviderChange}
            />
            <ModelSelectorCompact
              aiProviderId={aiProviderId}
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
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

async function fetchSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    return {
      aiProvider: "google" as const,
      aiProviders: { defaultId: null, providers: [] } as AiProviderConfig,
    };
  }
  const data = await response.json();
  return {
    aiProvider: (data.aiProvider || "google") as
      | "google"
      | "anthropic"
      | "openai",
    aiProviders: parseAiProviderConfig(data.aiProviders),
  };
}

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
  aiProviderId = null,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  aiProviderId?: string | null;
}) {
  const [optimisticModelId, setOptimisticModelId] = useState(selectedModelId);
  const [mounted, setMounted] = useState(false);

  // Fetch user's provider setting
  const { data: settings } = useSWR("settings", fetchSettings, {
    fallbackData: {
      aiProvider: "google" as const,
      aiProviders: { defaultId: null, providers: [] },
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOptimisticModelId(selectedModelId);
  }, [selectedModelId]);

  const providerConfig = parseAiProviderConfig(settings?.aiProviders);
  const multi = isMultiAiProviders(providerConfig);
  const activeEntry = multi
    ? (findProviderById(providerConfig, aiProviderId) ??
      findProviderById(providerConfig, providerConfig.defaultId) ??
      providerConfig.providers[0])
    : undefined;
  const provider = activeEntry?.type || settings?.aiProvider || "google";
  const availableModels =
    provider === "custom" && activeEntry
      ? [
          {
            id: "chat-model",
            name: activeEntry.speedModelId || "Speed",
            description: "Speed mode — custom endpoint",
          },
          {
            id: "chat-model-reasoning",
            name: activeEntry.reasoningModelId || "Reasoning",
            description: "Reasoning mode — custom endpoint",
          },
        ]
      : chatModels.filter(
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
