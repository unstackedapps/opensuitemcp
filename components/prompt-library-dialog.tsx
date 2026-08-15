"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  Loader2,
  Search,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyPromptPlaceholders,
  extractPromptPlaceholders,
  labelForPlaceholderField,
  type PromptPlaceholderField,
} from "@/lib/netsuite/prompt-placeholders";
import { cn } from "@/lib/utils";

type PromptRecord = {
  id: string;
  name: string;
  category: string;
  roles: string[];
  industries: string[];
  prompt: string;
};

type PromptLibraryPanelProps = {
  active: boolean;
  title?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  onSelectPrompt?: (promptText: string, promptName: string) => void;
  onRequestClose?: () => void;
};

function parsePromptLibraryResult(result: unknown): {
  prompts: PromptRecord[];
  message?: string;
  error?: string;
} {
  if (!result || typeof result !== "object") {
    return { prompts: [], error: "Empty tool result" };
  }

  const record = result as {
    content?: Array<{ type?: string; text?: string }>;
    error?: string;
  };

  const text = record.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    return {
      prompts: [],
      error: "No prompt payload was received from NetSuite.",
    };
  }

  try {
    const parsed = JSON.parse(text) as {
      prompts?: unknown[];
      message?: string;
      error?: string;
    };
    const prompts = Array.isArray(parsed.prompts)
      ? parsed.prompts
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const prompt = item as Record<string, unknown>;
            if (
              typeof prompt.id !== "string" ||
              typeof prompt.name !== "string" ||
              typeof prompt.category !== "string" ||
              !Array.isArray(prompt.roles) ||
              !Array.isArray(prompt.industries) ||
              typeof prompt.prompt !== "string"
            ) {
              return null;
            }
            return {
              id: prompt.id,
              name: prompt.name,
              category: prompt.category,
              roles: prompt.roles.filter(
                (role): role is string => typeof role === "string",
              ),
              industries: prompt.industries.filter(
                (industry): industry is string => typeof industry === "string",
              ),
              prompt: prompt.prompt,
            } satisfies PromptRecord;
          })
          .filter((prompt): prompt is PromptRecord => prompt !== null)
      : [];

    return {
      prompts,
      message: parsed.message,
      error: parsed.error,
    };
  } catch (error) {
    return {
      prompts: [],
      error:
        error instanceof Error
          ? `Failed to parse prompt payload: ${error.message}`
          : "Failed to parse prompt payload",
    };
  }
}

function emptyValuesForFields(
  fields: PromptPlaceholderField[],
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.id, ""]));
}

export function PromptLibraryPanel({
  active,
  title = "NetSuite Prompt Library",
  toolName = "ns_prompt_library_app",
  toolInput,
  onSelectPrompt,
  onRequestClose,
}: PromptLibraryPanelProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [industry, setIndustry] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [step, setStep] = useState<"browse" | "fill">("browse");
  const [selectedPrompt, setSelectedPrompt] = useState<PromptRecord | null>(
    null,
  );
  const [placeholderValues, setPlaceholderValues] = useState<
    Record<string, string>
  >({});

  const searchInputId = useId();

  const resetFillState = () => {
    setStep("browse");
    setSelectedPrompt(null);
    setPlaceholderValues({});
  };

  const toolInputKey = useMemo(
    () => JSON.stringify(toolInput ?? {}),
    [toolInput],
  );

  // resetFillState only clears local UI state; including it would re-fetch every render
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch key is active/toolName/toolInputKey
  useEffect(() => {
    if (!active) {
      setStatus("loading");
      setError(null);
      setPrompts([]);
      setSearchQuery("");
      setCategory("all");
      setIndustry("all");
      setRole("all");
      resetFillState();
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);
    resetFillState();

    const argumentsPayload = JSON.parse(toolInputKey) as Record<
      string,
      unknown
    >;

    void (async () => {
      try {
        const response = await fetch("/api/netsuite/mcp-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: toolName,
            arguments: argumentsPayload,
          }),
        });
        const payload = await response.json();
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setError(
            payload.error || "This NetSuite MCP tool is disabled in Settings.",
          );
          setStatus("error");
          return;
        }
        const parsed = parsePromptLibraryResult(payload);
        if (parsed.error && parsed.prompts.length === 0) {
          setError(parsed.error);
          setStatus("error");
          return;
        }
        setPrompts(parsed.prompts);
        setStatus("ready");
        console.log(
          `[Prompt Library] Loaded ${parsed.prompts.length} prompts`,
          parsed.message ?? "",
        );
      } catch (fetchError) {
        if (cancelled) {
          return;
        }
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load prompt library",
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, toolName, toolInputKey]);

  const categories = useMemo(
    () =>
      [
        ...new Set(prompts.map((prompt) => prompt.category).filter(Boolean)),
      ].sort(),
    [prompts],
  );
  const industries = useMemo(
    () =>
      [
        ...new Set(
          prompts.flatMap((prompt) => prompt.industries).filter(Boolean),
        ),
      ].sort(),
    [prompts],
  );
  const roles = useMemo(
    () =>
      [
        ...new Set(prompts.flatMap((prompt) => prompt.roles).filter(Boolean)),
      ].sort(),
    [prompts],
  );

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return prompts.filter((prompt) => {
      if (category !== "all" && prompt.category !== category) {
        return false;
      }
      if (industry !== "all" && !prompt.industries.includes(industry)) {
        return false;
      }
      if (role !== "all" && !prompt.roles.includes(role)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        prompt.name,
        prompt.category,
        prompt.prompt,
        ...prompt.roles,
        ...prompt.industries,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [prompts, searchQuery, category, industry, role]);

  const selectedPlaceholders = useMemo(
    () =>
      selectedPrompt ? extractPromptPlaceholders(selectedPrompt.prompt) : [],
    [selectedPrompt],
  );

  const previewText = useMemo(() => {
    if (!selectedPrompt) {
      return "";
    }
    return applyPromptPlaceholders(
      selectedPrompt.prompt,
      selectedPlaceholders,
      placeholderValues,
    );
  }, [selectedPrompt, selectedPlaceholders, placeholderValues]);

  const allPlaceholdersFilled =
    selectedPlaceholders.length > 0 &&
    selectedPlaceholders.every(
      (field) => (placeholderValues[field.id] ?? "").trim().length > 0,
    );

  const handleSelectPrompt = (prompt: PromptRecord) => {
    const fields = extractPromptPlaceholders(prompt.prompt);
    if (fields.length === 0) {
      onSelectPrompt?.(prompt.prompt, prompt.name);
      onRequestClose?.();
      return;
    }
    setSelectedPrompt(prompt);
    setPlaceholderValues(emptyValuesForFields(fields));
    setStep("fill");
  };

  const handleUseFilledPrompt = () => {
    if (!selectedPrompt || !allPlaceholdersFilled) {
      return;
    }
    const filled = applyPromptPlaceholders(
      selectedPrompt.prompt,
      selectedPlaceholders,
      Object.fromEntries(
        Object.entries(placeholderValues).map(([id, value]) => [
          id,
          value.trim(),
        ]),
      ),
    );
    onSelectPrompt?.(filled, selectedPrompt.name);
    onRequestClose?.();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-border/60 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 font-medium text-sm">
            <BookOpen className="size-3.5 text-muted-foreground" />
            {step === "fill" && selectedPrompt ? selectedPrompt.name : title}
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {step === "fill"
              ? "Fill in the required values, then use the prompt in chat."
              : "Companion SuiteApp templates. Select one to drop it into chat."}
          </p>
        </div>
        {step === "browse" ? (
          <a
            className="hidden shrink-0 items-center gap-1 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline sm:inline-flex"
            href="https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_9091153093.html"
            rel="noopener noreferrer"
            target="_blank"
          >
            Companion docs
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>

      {status === "loading" ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading prompt library…
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-destructive text-sm">{error}</p>
          <Button
            onClick={() => onRequestClose?.()}
            type="button"
            variant="outline"
          >
            Close
          </Button>
        </div>
      ) : null}

      {status === "ready" && step === "browse" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-2.5 border-border/60 border-b px-4 py-3 sm:px-5">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                <Label
                  className="text-xs text-muted-foreground"
                  htmlFor={searchInputId}
                >
                  Search
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8"
                    id={searchInputId}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search title, role, industry, or prompt"
                    value={searchQuery}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Category
                </Label>
                <Select onValueChange={setCategory} value={category}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Industry
                </Label>
                <Select onValueChange={setIndustry} value={industry}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Industries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Industries</SelectItem>
                    {industries.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Select onValueChange={setRole} value={role}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {roles.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              {filtered.length} showing
              <span className="text-muted-foreground/70">
                {" "}
                · {prompts.length} total
              </span>
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-6 py-12 text-center text-muted-foreground text-sm">
                No prompts match these filters.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((prompt) => {
                  const placeholderCount = extractPromptPlaceholders(
                    prompt.prompt,
                  ).length;
                  const useLabel =
                    placeholderCount > 0 ? "Fill & use" : "Use prompt";
                  return (
                    <li key={prompt.id}>
                      <button
                        className={cn(
                          "group flex w-full items-center gap-4 px-6 py-3.5 text-left transition-colors",
                          "hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none",
                        )}
                        onClick={() => handleSelectPrompt(prompt)}
                        type="button"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="font-medium text-sm leading-snug">
                              {prompt.name}
                            </p>
                            <span className="text-muted-foreground text-xs">
                              {prompt.category}
                            </span>
                            {placeholderCount > 0 ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {placeholderCount}{" "}
                                {placeholderCount === 1 ? "value" : "values"}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-1 text-muted-foreground text-xs leading-relaxed">
                            {prompt.prompt}
                          </p>
                          {(prompt.industries.length > 0 ||
                            prompt.roles.length > 0) && (
                            <p className="mt-1 truncate text-[11px] text-muted-foreground/80">
                              {[
                                ...prompt.industries.slice(0, 2),
                                ...prompt.roles.slice(0, 2),
                              ].join(" · ")}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/70",
                            "bg-background px-2.5 py-1.5 font-medium text-xs",
                            "text-foreground transition-colors",
                            "group-hover:border-foreground/25 group-hover:bg-foreground group-hover:text-background",
                          )}
                        >
                          {useLabel}
                          <ArrowRight className="size-3.5" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {status === "ready" && step === "fill" && selectedPrompt ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  This template needs {selectedPlaceholders.length}{" "}
                  {selectedPlaceholders.length === 1 ? "value" : "values"}{" "}
                  before it can run.
                </p>
                <div className="space-y-3">
                  {selectedPlaceholders.map((field) => {
                    const fieldId = `placeholder-${field.id}`;
                    const label = labelForPlaceholderField(field);
                    return (
                      <div className="space-y-1.5" key={field.id}>
                        <Label htmlFor={fieldId}>
                          {label}
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {field.token}
                            {field.totalOfToken > 1
                              ? ` #${field.occurrence + 1}`
                              : ""}
                          </span>
                        </Label>
                        <Input
                          id={fieldId}
                          onChange={(event) =>
                            setPlaceholderValues((prev) => ({
                              ...prev,
                              [field.id]: event.target.value,
                            }))
                          }
                          placeholder={`Enter ${label.toLowerCase()}`}
                          value={placeholderValues[field.id] ?? ""}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex min-h-48 flex-1 flex-col border-border/60 border-t px-6 py-4 lg:min-h-0 lg:border-t-0 lg:border-l">
              <Label className="mb-2 shrink-0">Preview</Label>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {previewText}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t px-6 py-4">
            <Button
              onClick={() => {
                resetFillState();
              }}
              type="button"
              variant="ghost"
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button
              disabled={!allPlaceholdersFilled}
              onClick={handleUseFilledPrompt}
              type="button"
            >
              Use prompt
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
