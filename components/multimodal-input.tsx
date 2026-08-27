"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Blocks, BookOpen } from "lucide-react";
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
import useSWR from "swr";
import { useWindowSize } from "usehooks-ts";
import { ComposerModelMenu } from "@/components/composer-model-menu";
import { ComposerWebSearchMenu } from "@/components/composer-web-search-menu";
import {
  ConnectedSkillSlashMenu,
  filterSlashSkills,
  insertSlashSkillToken,
  parseTrailingSlashQuery,
  resolveSlashSkillsInText,
  type SlashConnectedSkill,
  shouldPickSlashSkillOnSubmit,
} from "@/components/connected-skill-slash-menu";
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

async function fetchConnectedSlashSkills(): Promise<SlashConnectedSkill[]> {
  const response = await fetch("/api/skills");
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    connectedSkills?: Array<{
      id: string;
      name: string;
      description: string;
      slug?: string;
      sourceId?: string;
      connectionLabel?: string;
    }>;
    disabledOrgConnectedSkillSourceIds?: string[];
  };
  const disabledSourceIds = new Set(
    payload.disabledOrgConnectedSkillSourceIds ?? [],
  );
  return (payload.connectedSkills ?? [])
    .filter(
      (skill) =>
        typeof skill.slug === "string" &&
        skill.slug.length > 0 &&
        (!skill.sourceId || !disabledSourceIds.has(skill.sourceId)),
    )
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      slug: skill.slug as string,
      connectionLabel: skill.connectionLabel ?? "Connected",
    }));
}

function PersonaInterviewActions({
  className,
  onSavePersona,
  onCancelInterview,
  isDraftingPersona = false,
}: {
  className?: string;
  onSavePersona?: () => void;
  onCancelInterview?: () => void;
  isDraftingPersona?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        className="h-8 min-w-0 flex-1 px-3 text-xs sm:flex-none sm:px-2"
        disabled={isDraftingPersona}
        onClick={onSavePersona}
        type="button"
        variant="default"
      >
        {isDraftingPersona ? "Drafting playbook…" : "Save persona"}
      </Button>
      <Button
        className="h-8 min-w-0 flex-1 px-3 text-xs sm:flex-none sm:px-2"
        onClick={onCancelInterview}
        type="button"
        variant="ghost"
      >
        Cancel interview
      </Button>
    </div>
  );
}

function ComposerSideTools({
  className,
  onOpenPromptLibrary,
}: {
  className?: string;
  onOpenPromptLibrary: () => void;
}) {
  const { openPortal } = useAppPortal();

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <NetSuiteAccountSwitcher />
      <TooltipProvider delayDuration={300}>
        <ComposerWebSearchMenu />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Skills"
              className="size-8 px-2 focus-visible:ring-0"
              onClick={() => openPortal("skills")}
              type="button"
              variant="ghost"
            >
              <Blocks className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Skills</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Prompt Library"
              className="size-8 px-2 focus-visible:ring-0"
              onClick={onOpenPromptLibrary}
              type="button"
              variant="ghost"
            >
              <BookOpen className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Prompt Library</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

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
  followSettingsDefault = false,
  personaName,
  isPersonaBuilder = false,
  isDraftingPersona = false,
  onSavePersona,
  onCancelInterview,
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
  followSettingsDefault?: boolean;
  personaName?: string;
  isPersonaBuilder?: boolean;
  isDraftingPersona?: boolean;
  onSavePersona?: () => void;
  onCancelInterview?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [mounted, setMounted] = useState(false);
  const { openPortal, registerPromptHandler } = useAppPortal();
  /** Disambiguates duplicate slugs across connected packs after a menu pick. */
  const [preferredSkillIdsBySlug, setPreferredSkillIdsBySlug] = useState<
    Record<string, string>
  >({});
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);

  const { data: connectedSkills = [] } = useSWR(
    mounted && !disabled && !isPersonaBuilder ? "connected-slash-skills" : null,
    fetchConnectedSlashSkills,
    { revalidateOnFocus: true },
  );

  const slashQuery = useMemo(() => parseTrailingSlashQuery(input), [input]);

  const slashFiltered = useMemo(
    () =>
      slashQuery ? filterSlashSkills(connectedSkills, slashQuery.query) : [],
    [connectedSkills, slashQuery],
  );

  const selectSlashSkill = useCallback(
    (skill: SlashConnectedSkill) => {
      if (!slashQuery) {
        return;
      }
      setPreferredSkillIdsBySlug((current) => ({
        ...current,
        [skill.slug.toLowerCase()]: skill.id,
      }));
      setInput(insertSlashSkillToken(input, slashQuery.start, skill));
      setSlashActiveIndex(0);
      textareaRef.current?.focus();
    },
    [input, setInput, slashQuery],
  );

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
    setSlashActiveIndex(0);
  };

  const submitForm = useCallback(() => {
    window.history.pushState({}, "", `/chat/${chatId}`);

    const resolved = resolveSlashSkillsInText(
      input,
      connectedSkills,
      preferredSkillIdsBySlug,
    );
    if (!resolved.ok) {
      toast({
        type: "error",
        description: `Multiple skills share /${resolved.slug} — pick one from the / menu.`,
      });
      return;
    }

    const invokedSkills = resolved.skills;
    const displayText = input.trim();
    if (!displayText && invokedSkills.length === 0) {
      return;
    }

    const fallbackNames = invokedSkills.map((skill) => skill.name).join(", ");
    sendMessage(
      {
        role: "user",
        parts: [
          ...(invokedSkills.length > 0
            ? [
                {
                  type: "data-invokedConnectedSkills" as const,
                  data: invokedSkills.map((skill) => ({
                    id: skill.id,
                    slug: skill.slug,
                    name: skill.name,
                  })),
                },
              ]
            : []),
          {
            type: "text",
            text:
              displayText ||
              `Use the ${fallbackNames || "connected"} skill${invokedSkills.length === 1 ? "" : "s"}.`,
          },
        ],
      },
      invokedSkills.length > 0
        ? {
            body: {
              invokedConnectedSkillIds: invokedSkills.map((skill) => skill.id),
            },
          }
        : undefined,
    );

    resetHeight();
    setInput("");
    setPreferredSkillIdsBySlug({});

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
  }, [
    input,
    setInput,
    sendMessage,
    width,
    chatId,
    resetHeight,
    mounted,
    preferredSkillIdsBySlug,
    connectedSkills,
  ]);

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
      {slashQuery ? (
        <ConnectedSkillSlashMenu
          activeIndex={slashActiveIndex}
          onHoverIndex={setSlashActiveIndex}
          onSelect={selectSlashSkill}
          query={slashQuery.query}
          skills={connectedSkills}
        />
      ) : null}
      <div className="flex flex-col gap-1">
        {isPersonaBuilder ? (
          <PersonaInterviewActions
            className="px-1 sm:hidden"
            isDraftingPersona={isDraftingPersona}
            onCancelInterview={onCancelInterview}
            onSavePersona={onSavePersona}
          />
        ) : null}
        <PromptInput
          className="rounded-3xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
          onSubmit={(event) => {
            event.preventDefault();
            // Stop is a separate control while submitted/streaming; ignore Enter/submit then.
            if (status === "streaming" || status === "submitted") {
              return;
            }
            if (
              slashQuery &&
              shouldPickSlashSkillOnSubmit(slashQuery.query, slashFiltered)
            ) {
              const pick =
                slashFiltered.at(slashActiveIndex) ?? slashFiltered.at(0);
              if (pick) {
                selectSlashSkill(pick);
                return;
              }
            }
            submitForm();
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
              onKeyDown={(event) => {
                if (!slashQuery || slashFiltered.length === 0) {
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSlashActiveIndex(
                    (index) => (index + 1) % slashFiltered.length,
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSlashActiveIndex(
                    (index) =>
                      (index - 1 + slashFiltered.length) % slashFiltered.length,
                  );
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  if (slashQuery.start >= 0) {
                    setInput(
                      input.slice(0, slashQuery.start).replace(/\s+$/, ""),
                    );
                  }
                }
              }}
              placeholder={
                disabled && !personaName
                  ? "Choose a persona to continue…"
                  : personaName
                    ? `Ask ${personaName} anything…`
                    : "Ask Ava anything…"
              }
              ref={(node) => {
                (
                  textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>
                ).current = node;
              }}
              rows={1}
              value={input}
            />{" "}
            <Context {...contextProps} />
          </div>{" "}
          <PromptInputToolbar className="border-top-0! border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
            <PromptInputTools className="min-w-0 gap-0 sm:gap-0.5">
              {isPersonaBuilder ? (
                <PersonaInterviewActions
                  className="hidden sm:flex"
                  isDraftingPersona={isDraftingPersona}
                  onCancelInterview={onCancelInterview}
                  onSavePersona={onSavePersona}
                />
              ) : null}
              <ComposerModelMenu
                aiProviderId={aiProviderId}
                chatId={chatId}
                followSettingsDefault={followSettingsDefault}
                onAiProviderChange={onAiProviderChange}
                onModelChange={onModelChange}
                selectedModelId={selectedModelId}
              />
              <ComposerSideTools
                className="hidden sm:flex"
                onOpenPromptLibrary={openPromptLibrary}
              />
            </PromptInputTools>

            <div className="flex items-center justify-end gap-2">
              {(status === "submitted" || status === "streaming") && (
                <Spinner className="text-muted-foreground" />
              )}
              {status === "submitted" || status === "streaming" ? (
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
        <ComposerSideTools
          className="px-1 sm:hidden"
          onOpenPromptLibrary={openPromptLibrary}
        />
      </div>
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
    if (prevProps.followSettingsDefault !== nextProps.followSettingsDefault) {
      return false;
    }
    if (prevProps.disabled !== nextProps.disabled) {
      return false;
    }
    if (prevProps.personaName !== nextProps.personaName) {
      return false;
    }
    if (prevProps.isPersonaBuilder !== nextProps.isPersonaBuilder) {
      return false;
    }
    if (prevProps.isDraftingPersona !== nextProps.isDraftingPersona) {
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
