"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  LoaderIcon,
  WarningIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  type AiProviderConfig,
  type AiProviderEntry,
  type AiProviderType,
  type CustomModelOption,
  findDuplicateProviderLabel,
  isMultiAiProviders,
  providerTypeLabel,
} from "@/lib/ai/provider-entries";
import { generateUUID } from "@/lib/utils";
import { toast } from "./toast";

export type ClassicProviderType = "google" | "anthropic" | "openai";

type AiProviderSettingsProps = {
  showSkeletons: boolean;
  classicProvider: ClassicProviderType;
  onClassicProviderChange: (value: ClassicProviderType) => void;
  googleApiKey: string;
  onGoogleApiKeyChange: (value: string) => void;
  anthropicApiKey: string;
  onAnthropicApiKeyChange: (value: string) => void;
  openaiApiKey: string;
  onOpenaiApiKeyChange: (value: string) => void;
  maxIterations: string;
  onMaxIterationsChange: (value: string) => void;
  googleApiKeyId: string;
  anthropicApiKeyId: string;
  openaiApiKeyId: string;
  maxIterationsId: string;
  showGoogleApiKey: boolean;
  onToggleGoogleApiKey: () => void;
  showAnthropicApiKey: boolean;
  onToggleAnthropicApiKey: () => void;
  showOpenaiApiKey: boolean;
  onToggleOpenaiApiKey: () => void;
  aiProviders: AiProviderConfig;
  onAiProvidersChange: (value: AiProviderConfig) => void;
  onPersistProviders: (value: AiProviderConfig) => Promise<void>;
  onGraduate: (entry: AiProviderEntry) => Promise<void>;
};

const TYPE_OPTIONS: Array<{ value: AiProviderType; label: string }> = [
  { value: "google", label: "Google (Gemini)" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT)" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
];

export function AiProviderSettings({
  showSkeletons,
  classicProvider,
  onClassicProviderChange,
  googleApiKey,
  onGoogleApiKeyChange,
  anthropicApiKey,
  onAnthropicApiKeyChange,
  openaiApiKey,
  onOpenaiApiKeyChange,
  maxIterations,
  onMaxIterationsChange,
  googleApiKeyId,
  anthropicApiKeyId,
  openaiApiKeyId,
  maxIterationsId,
  showGoogleApiKey,
  onToggleGoogleApiKey,
  showAnthropicApiKey,
  onToggleAnthropicApiKey,
  showOpenaiApiKey,
  onToggleOpenaiApiKey,
  aiProviders,
  onAiProvidersChange,
  onPersistProviders,
  onGraduate,
}: AiProviderSettingsProps) {
  const multi = isMultiAiProviders(aiProviders);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<AiProviderEntry>(() =>
    emptyDraft("openai"),
  );
  const [showDraftKey, setShowDraftKey] = useState(false);
  const [models, setModels] = useState<CustomModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AiProviderEntry | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

  const openEdit = (entry: AiProviderEntry) => {
    setEditingId(entry.id);
    setEditDraft({ ...entry });
    setModels([]);
    setShowDraftKey(false);
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditDraft(null);
    setModels([]);
    setShowDraftKey(false);
  };

  if (showSkeletons) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const startAdd = (type: AiProviderType = "openai") => {
    closeEdit();
    setDraft(emptyDraft(type));
    setModels([]);
    setShowDraftKey(false);
    setAdding(true);
  };

  const handleReloadModels = async (entry: AiProviderEntry) => {
    setLoadingModels(true);
    try {
      const response = await fetch("/api/settings/ai-providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: entry.type,
          baseUrl: entry.baseUrl,
          apiKey: entry.apiKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to list models");
      }
      const nextModels = (data.models ?? []) as CustomModelOption[];
      setModels(nextModels);
      const firstId = nextModels[0]?.id;
      const nextSpeed = entry.speedModelId || firstId;
      const nextReasoning = entry.reasoningModelId || firstId;
      if (adding && draft.id === entry.id) {
        setDraft((previous) => ({
          ...previous,
          speedModelId: nextSpeed,
          reasoningModelId: nextReasoning,
        }));
      } else if (editDraft && editDraft.id === entry.id) {
        setEditDraft((previous) =>
          previous
            ? {
                ...previous,
                speedModelId: nextSpeed,
                reasoningModelId: nextReasoning,
              }
            : previous,
        );
      }
      toast({
        type: "success",
        description: `API key works. Found ${nextModels.length} model${nextModels.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setModels([]);
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to list models",
      });
    } finally {
      setLoadingModels(false);
    }
  };

  const handleAdd = async () => {
    const reservedLegacy = multi
      ? []
      : classicReservedEntries(googleApiKey, anthropicApiKey, openaiApiKey);
    const labelError = validateDraft(draft, [
      ...reservedLegacy,
      ...aiProviders.providers,
    ]);
    if (labelError) {
      toast({ type: "error", description: labelError });
      return;
    }
    setSavingAdd(true);
    try {
      if (!multi) {
        await onGraduate(draft);
      } else {
        const duplicate = findDuplicateProviderLabel([
          ...aiProviders.providers,
          draft,
        ]);
        if (duplicate) {
          throw new Error(`Provider label "${duplicate}" is already in use.`);
        }
        const nextConfig = {
          defaultId: aiProviders.defaultId ?? draft.id,
          providers: [...aiProviders.providers, draft],
        };
        await onPersistProviders(nextConfig);
        onAiProvidersChange(nextConfig);
        toast({
          type: "success",
          description: "Provider added.",
        });
      }
      setAdding(false);
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to add provider",
      });
    } finally {
      setSavingAdd(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editDraft || !editingId) {
      return;
    }
    const others = aiProviders.providers.filter(
      (entry) => entry.id !== editingId,
    );
    const labelError = validateDraft(editDraft, others);
    if (labelError) {
      toast({ type: "error", description: labelError });
      return;
    }
    setSavingEditId(editingId);
    try {
      const nextConfig = {
        ...aiProviders,
        providers: aiProviders.providers.map((entry) =>
          entry.id === editingId ? editDraft : entry,
        ),
      };
      await onPersistProviders(nextConfig);
      onAiProvidersChange(nextConfig);
      toast({ type: "success", description: "Provider saved." });
      closeEdit();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to save provider",
      });
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (aiProviders.providers.length <= 1) {
      toast({
        type: "error",
        description: "You must keep at least one AI provider.",
      });
      return;
    }
    const providers = aiProviders.providers.filter((entry) => entry.id !== id);
    const nextConfig = {
      defaultId:
        aiProviders.defaultId === id
          ? (providers[0]?.id ?? null)
          : aiProviders.defaultId,
      providers,
    };
    try {
      await onPersistProviders(nextConfig);
      onAiProvidersChange(nextConfig);
      if (editingId === id) {
        closeEdit();
      }
      toast({ type: "success", description: "Provider removed." });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to remove provider",
      });
    }
  };

  const handleSetDefault = async (id: string) => {
    const nextConfig = {
      ...aiProviders,
      defaultId: id,
    };
    try {
      await onPersistProviders(nextConfig);
      onAiProvidersChange(nextConfig);
      toast({ type: "success", description: "Default provider updated." });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update default provider",
      });
    }
  };

  return (
    <div className="space-y-6">
      {multi ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-sm">
                Providers ({aiProviders.providers.length})
              </p>
              <p className="text-muted-foreground text-xs">
                Unique labels, e.g. openai: personal and openai: work.
              </p>
            </div>
            <Button onClick={() => startAdd()} size="sm" type="button">
              <Plus className="size-4" />
              Add AI Provider
            </Button>
          </div>
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {aiProviders.providers.map((entry) => {
              const isEditing = editingId === entry.id && editDraft != null;
              return (
                <li className="px-2.5 py-2" key={entry.id}>
                  <div className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">
                        {entry.label}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {providerTypeLabel(entry.type)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {aiProviders.defaultId === entry.id ? (
                        <Badge variant="secondary">Default</Badge>
                      ) : (
                        <Button
                          onClick={() => {
                            void handleSetDefault(entry.id);
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Set default
                        </Button>
                      )}
                      <Button
                        aria-expanded={isEditing}
                        aria-label={`Edit ${entry.label}`}
                        className="size-7"
                        onClick={() => {
                          if (editingId === entry.id) {
                            closeEdit();
                          } else {
                            openEdit(entry);
                          }
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        aria-label={`Remove ${entry.label}`}
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          void handleDelete(entry.id);
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {isEditing && editDraft ? (
                    <div className="mt-2 space-y-3 border-border/60 border-t pt-2">
                      <ProviderFields
                        anthropicApiKeyId={`${entry.id}-anthropic`}
                        entry={editDraft}
                        googleApiKeyId={`${entry.id}-google`}
                        loadingModels={loadingModels}
                        maxIterationsId={`${entry.id}-max`}
                        models={
                          editDraft.type === "custom"
                            ? models.length > 0
                              ? models
                              : [
                                  ...(editDraft.speedModelId
                                    ? [{ id: editDraft.speedModelId }]
                                    : []),
                                  ...(editDraft.reasoningModelId &&
                                  editDraft.reasoningModelId !==
                                    editDraft.speedModelId
                                    ? [{ id: editDraft.reasoningModelId }]
                                    : []),
                                ]
                            : models
                        }
                        onChange={(patch) =>
                          setEditDraft((previous) =>
                            previous ? { ...previous, ...patch } : previous,
                          )
                        }
                        onReloadModels={() => {
                          void handleReloadModels(editDraft);
                        }}
                        openaiApiKeyId={`${entry.id}-openai`}
                        showKey={showDraftKey}
                        onToggleKey={() => setShowDraftKey((value) => !value)}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          disabled={savingEditId === entry.id}
                          onClick={closeEdit}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={savingEditId === entry.id}
                          onClick={() => {
                            void handleSaveEdit();
                          }}
                          size="sm"
                          type="button"
                        >
                          {savingEditId === entry.id ? (
                            <>
                              <LoaderIcon size={16} />
                              Saving...
                            </>
                          ) : (
                            "Save"
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              onValueChange={(value: ClassicProviderType) => {
                onClassicProviderChange(value);
              }}
              value={classicProvider}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google">Google (Gemini)</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="openai">OpenAI (GPT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-4 border-t border-border/60 pt-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">API keys & limits</p>
                <p className="text-muted-foreground text-xs">
                  API key and reasoning limits for the selected provider.
                </p>
              </div>
              <Button onClick={() => startAdd()} size="sm" type="button">
                <Plus className="size-4" />
                Add AI Provider
              </Button>
            </div>
            {classicProvider === "openai" ? <OpenAiWarning /> : null}
            {classicProvider === "google" ? (
              <ApiKeyField
                helpHref="https://aistudio.google.com/apikey"
                helpLabel="aistudio.google.com/apikey"
                id={googleApiKeyId}
                label="Google API Key"
                onChange={onGoogleApiKeyChange}
                onToggle={onToggleGoogleApiKey}
                placeholder="Enter your Google API key"
                show={showGoogleApiKey}
                value={googleApiKey}
              />
            ) : null}
            {classicProvider === "anthropic" ? (
              <ApiKeyField
                helpHref="https://console.anthropic.com/"
                helpLabel="console.anthropic.com"
                id={anthropicApiKeyId}
                label="Anthropic API Key"
                onChange={onAnthropicApiKeyChange}
                onToggle={onToggleAnthropicApiKey}
                placeholder="Enter your Anthropic API key"
                show={showAnthropicApiKey}
                value={anthropicApiKey}
              />
            ) : null}
            {classicProvider === "openai" ? (
              <ApiKeyField
                helpHref="https://platform.openai.com/api-keys"
                helpLabel="platform.openai.com/api-keys"
                id={openaiApiKeyId}
                label="OpenAI API Key"
                onChange={onOpenaiApiKeyChange}
                onToggle={onToggleOpenaiApiKey}
                placeholder="Enter your OpenAI API key"
                show={showOpenaiApiKey}
                value={openaiApiKey}
              />
            ) : null}
            <MaxIterationsField
              id={maxIterationsId}
              onChange={onMaxIterationsChange}
              value={maxIterations}
            />
          </div>
        </>
      )}

      {adding ? (
        <div className="space-y-4 rounded-md border border-border p-3">
          <p className="font-medium text-sm">New AI provider</p>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              onValueChange={(value: AiProviderType) => {
                setDraft(emptyDraft(value));
                setModels([]);
              }}
              value={draft.type}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ProviderFields
            anthropicApiKeyId="new-anthropic"
            entry={draft}
            googleApiKeyId="new-google"
            loadingModels={loadingModels}
            maxIterationsId="new-max"
            models={models}
            onChange={(patch) =>
              setDraft((previous) => ({ ...previous, ...patch }))
            }
            onReloadModels={() => {
              void handleReloadModels(draft);
            }}
            openaiApiKeyId="new-openai"
            showKey={showDraftKey}
            onToggleKey={() => setShowDraftKey((value) => !value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setAdding(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                savingAdd ||
                (draft.type === "custom" &&
                  (!draft.speedModelId?.trim() ||
                    !draft.reasoningModelId?.trim()))
              }
              onClick={() => void handleAdd()}
              type="button"
            >
              {savingAdd ? (
                <>
                  <LoaderIcon size={16} />
                  Adding...
                </>
              ) : (
                "Add provider"
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function classicReservedEntries(
  googleApiKey: string,
  anthropicApiKey: string,
  openaiApiKey: string,
): AiProviderEntry[] {
  const entries: AiProviderEntry[] = [];
  if (googleApiKey.trim()) {
    entries.push({
      id: "legacy-google",
      label: "google",
      type: "google",
      apiKey: googleApiKey,
      maxIterations: "10",
    });
  }
  if (anthropicApiKey.trim()) {
    entries.push({
      id: "legacy-anthropic",
      label: "anthropic",
      type: "anthropic",
      apiKey: anthropicApiKey,
      maxIterations: "10",
    });
  }
  if (openaiApiKey.trim()) {
    entries.push({
      id: "legacy-openai",
      label: "openai",
      type: "openai",
      apiKey: openaiApiKey,
      maxIterations: "10",
    });
  }
  return entries;
}

function emptyDraft(type: AiProviderType): AiProviderEntry {
  return {
    id: generateUUID(),
    label: "",
    type,
    apiKey: "",
    maxIterations: "10",
    baseUrl: type === "custom" ? "" : undefined,
    speedModelId: type === "custom" ? "" : undefined,
    reasoningModelId: type === "custom" ? "" : undefined,
  };
}

function validateDraft(
  draft: AiProviderEntry,
  existing: AiProviderEntry[],
): string | null {
  if (!draft.label.trim()) {
    return "Label is required (e.g. openai: personal).";
  }
  if (findDuplicateProviderLabel([...existing, draft])) {
    return `Provider label "${draft.label}" is already in use.`;
  }
  if (draft.type !== "custom" && !draft.apiKey?.trim()) {
    return "Enter an API key for this provider.";
  }
  if (draft.type === "custom") {
    if (!draft.baseUrl?.trim()) {
      return "Enter a base URL.";
    }
    if (!draft.speedModelId?.trim() || !draft.reasoningModelId?.trim()) {
      return "Reload models and pick Speed and Reasoning.";
    }
  }
  return null;
}

function ProviderFields({
  entry,
  onChange,
  showKey,
  onToggleKey,
  googleApiKeyId,
  anthropicApiKeyId,
  openaiApiKeyId,
  maxIterationsId,
  models,
  onReloadModels,
  loadingModels = false,
}: {
  entry: AiProviderEntry;
  onChange: (patch: Partial<AiProviderEntry>) => void;
  showKey: boolean;
  onToggleKey: () => void;
  googleApiKeyId: string;
  anthropicApiKeyId: string;
  openaiApiKeyId: string;
  maxIterationsId: string;
  models: CustomModelOption[];
  onReloadModels: () => void;
  loadingModels?: boolean;
}) {
  const keyId =
    entry.type === "anthropic"
      ? anthropicApiKeyId
      : entry.type === "openai"
        ? openaiApiKeyId
        : googleApiKeyId;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${entry.id}-label`}>Label</Label>
        <Input
          id={`${entry.id}-label`}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder={
            entry.type === "custom"
              ? "custom: gateway"
              : `${entry.type}: personal`
          }
          value={entry.label}
        />
      </div>
      {entry.type === "openai" ? <OpenAiWarning /> : null}
      {entry.type === "custom" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${entry.id}-url`}>Base URL</Label>
            <Input
              id={`${entry.id}-url`}
              onChange={(event) => onChange({ baseUrl: event.target.value })}
              placeholder="http://localhost:11434/v1"
              value={entry.baseUrl ?? ""}
            />
          </div>
          <ApiKeyField
            helpHref=""
            helpLabel=""
            id={keyId}
            label="API key (optional)"
            onChange={(value) => onChange({ apiKey: value })}
            onToggle={onToggleKey}
            placeholder="Optional Bearer token"
            show={showKey}
            value={entry.apiKey ?? ""}
          />
          <div className="flex items-center gap-2">
            <Button
              disabled={loadingModels}
              onClick={onReloadModels}
              type="button"
              variant="outline"
            >
              {loadingModels ? "Loading models..." : "Reload models"}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Speed model</Label>
              <Select
                onValueChange={(value) => onChange({ speedModelId: value })}
                value={entry.speedModelId || undefined}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select speed model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={`speed-${model.id}`} value={model.id}>
                      {model.name || model.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reasoning model</Label>
              <Select
                onValueChange={(value) => onChange({ reasoningModelId: value })}
                value={entry.reasoningModelId || undefined}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select reasoning model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={`reason-${model.id}`} value={model.id}>
                      {model.name || model.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      ) : (
        <>
          <ApiKeyField
            helpHref={
              entry.type === "google"
                ? "https://aistudio.google.com/apikey"
                : entry.type === "anthropic"
                  ? "https://console.anthropic.com/"
                  : "https://platform.openai.com/api-keys"
            }
            helpLabel={
              entry.type === "google"
                ? "aistudio.google.com/apikey"
                : entry.type === "anthropic"
                  ? "console.anthropic.com"
                  : "platform.openai.com/api-keys"
            }
            id={keyId}
            label={`${providerTypeLabel(entry.type)} API Key`}
            onChange={(value) => onChange({ apiKey: value })}
            onToggle={onToggleKey}
            placeholder={`Enter your ${providerTypeLabel(entry.type)} API key`}
            show={showKey}
            value={entry.apiKey ?? ""}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={loadingModels || !entry.apiKey?.trim()}
              onClick={onReloadModels}
              type="button"
              variant="outline"
            >
              {loadingModels ? "Testing..." : "Test API Key"}
            </Button>
            {models.length > 0 ? (
              <span className="text-muted-foreground text-xs">
                {models.length} model{models.length === 1 ? "" : "s"} available
              </span>
            ) : null}
          </div>
          {models.length > 0 ? (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border/60 px-3 py-2">
              <ul className="space-y-1">
                {models.map((model) => (
                  <li
                    className="truncate font-mono text-muted-foreground text-xs"
                    key={model.id}
                  >
                    {model.name ? `${model.name} (${model.id})` : model.id}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
      <MaxIterationsField
        id={maxIterationsId}
        onChange={(value) => onChange({ maxIterations: value })}
        value={entry.maxIterations}
      />
    </div>
  );
}

function ApiKeyField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  helpHref,
  helpLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
  helpHref: string;
  helpLabel: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {helpHref ? (
        <p className="text-muted-foreground text-xs">
          Get a key at{" "}
          <a
            className="text-primary underline hover:no-underline"
            href={helpHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            {helpLabel}
          </a>
          .
        </p>
      ) : null}
      <div className="relative">
        <Input
          autoComplete="off"
          className="pr-10"
          data-1p-ignore="true"
          data-form-type="other"
          data-lpignore="true"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={show ? "text" : "password"}
          value={value}
        />
        <Button
          className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
          onClick={onToggle}
          size="icon"
          type="button"
          variant="ghost"
        >
          {show ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </Button>
      </div>
    </div>
  );
}

function MaxIterationsField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Max Reasoning Steps</Label>
      <p className="text-muted-foreground text-xs">
        Maximum reasoning steps before stopping (1-20).
      </p>
      <Input
        id={id}
        max={20}
        min={1}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "" || /^\d+$/.test(next)) {
            const num = Number.parseInt(next, 10);
            if (next === "" || (num >= 1 && num <= 20)) {
              onChange(next);
            }
          }
        }}
        placeholder="10"
        type="number"
        value={value}
      />
    </div>
  );
}

function OpenAiWarning() {
  return (
    <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-500">
          <WarningIcon size={16} />
        </div>
        <div className="flex-1 space-y-1">
          <p className="font-medium text-sm text-yellow-900 dark:text-yellow-100">
            Organization Verification Required
          </p>
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            For enhanced reasoning features, verify your organization at{" "}
            <a
              className="text-primary underline hover:no-underline"
              href="https://platform.openai.com/settings/organization/general"
              rel="noopener noreferrer"
              target="_blank"
            >
              platform.openai.com/settings/organization/general
            </a>
            . Propagation can take up to 15 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
