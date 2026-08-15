"use client";

import { Eraser, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  LoaderIcon,
  WarningIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { modelsForProvider } from "@/lib/ai/model-registry";
import {
  type AiProviderConfig,
  type AiProviderEntry,
  type AiProviderType,
  type CustomModelOption,
  defaultLabelForProviderType,
  ensureUniqueProviderLabel,
  entryUsesModelOverrides,
  isCanonicalSeedEntry,
  isProviderEntryConfigured,
  providerTypeLabel,
  resolveDefaultProviderId,
  stockCanonicalSeedEntry,
  suggestedLabelForType,
  supportsHostedModelOverrides,
} from "@/lib/ai/provider-entries";
import { cn, generateUUID } from "@/lib/utils";
import { toast } from "./toast";

type AiProviderSettingsProps = {
  showSkeletons: boolean;
  aiProviders: AiProviderConfig;
  onAiProvidersChange: (value: AiProviderConfig) => void;
  onPersistProviders: (value: AiProviderConfig) => Promise<void>;
};

const TYPE_OPTIONS: Array<{ value: AiProviderType; label: string }> = [
  { value: "google", label: "Google (Gemini)" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT)" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
];

export function AiProviderSettings({
  showSkeletons,
  aiProviders,
  onAiProvidersChange,
  onPersistProviders,
}: AiProviderSettingsProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [configureId, setConfigureId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AiProviderEntry>(() =>
    emptyDraft("openai"),
  );
  const [showDraftKey, setShowDraftKey] = useState(false);
  const [models, setModels] = useState<CustomModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [savingModal, setSavingModal] = useState(false);

  const configureEntry = configureId
    ? aiProviders.providers.find((entry) => entry.id === configureId)
    : undefined;

  const openAddModal = () => {
    setDraft(emptyDraft("openai"));
    setModels([]);
    setShowDraftKey(false);
    setAddOpen(true);
  };

  const openConfigureModal = (entry: AiProviderEntry) => {
    setDraft({ ...entry });
    setModels([]);
    setShowDraftKey(false);
    setConfigureId(entry.id);
  };

  const closeConfigureModal = () => {
    setConfigureId(null);
    setModels([]);
    setShowDraftKey(false);
  };

  const handleReloadModels = async (entry: AiProviderEntry) => {
    const canonicalKeyTest =
      entry.type !== "custom" &&
      isCanonicalSeedEntry(entry, aiProviders.providers) &&
      !supportsHostedModelOverrides(entry, aiProviders.providers);

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

      if (canonicalKeyTest) {
        setModels([]);
        toast({ type: "success", description: "API key is valid." });
        return;
      }

      setModels(nextModels);
      const firstId = nextModels[0]?.id;
      setDraft((previous) => ({
        ...previous,
        speedModelId: previous.speedModelId || firstId,
        reasoningModelId: previous.reasoningModelId || firstId,
      }));
      toast({
        type: "success",
        description: `Found ${nextModels.length} model${nextModels.length === 1 ? "" : "s"}.`,
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
    const entry = withResolvedLabel(draft, aiProviders.providers);
    const validationError = validateDraft(entry, aiProviders.providers);
    if (validationError) {
      toast({ type: "error", description: validationError });
      return;
    }

    setSavingModal(true);
    try {
      const providers = [...aiProviders.providers, entry];
      const nextConfig = {
        providers,
        defaultId: resolveDefaultProviderId({
          defaultId: aiProviders.defaultId,
          providers,
        }),
      };
      await onPersistProviders(nextConfig);
      onAiProvidersChange(nextConfig);
      setAddOpen(false);
      toast({ type: "success", description: "Provider added." });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to add provider",
      });
    } finally {
      setSavingModal(false);
    }
  };

  const handleSaveConfigure = async () => {
    if (!configureId) {
      return;
    }
    const others = aiProviders.providers.filter(
      (provider) => provider.id !== configureId,
    );
    const entry = withResolvedLabel(draft, others, configureId);
    const validationError = validateDraft(entry, others);
    if (validationError) {
      toast({ type: "error", description: validationError });
      return;
    }

    setSavingModal(true);
    try {
      const providers = aiProviders.providers.map((provider) =>
        provider.id === configureId ? entry : provider,
      );
      const nextConfig = {
        providers,
        defaultId: resolveDefaultProviderId({
          defaultId: aiProviders.defaultId,
          providers,
        }),
      };
      await onPersistProviders(nextConfig);
      onAiProvidersChange(nextConfig);
      closeConfigureModal();
      toast({ type: "success", description: "Provider saved." });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to save provider",
      });
    } finally {
      setSavingModal(false);
    }
  };

  const handleResetSeed = async (entry: AiProviderEntry) => {
    if (!isCanonicalSeedEntry(entry, aiProviders.providers)) {
      return;
    }
    const providers = aiProviders.providers.map((provider) =>
      provider.id === entry.id ? stockCanonicalSeedEntry(entry) : provider,
    );
    const nextConfig = {
      providers,
      defaultId: resolveDefaultProviderId({
        defaultId:
          aiProviders.defaultId === entry.id ? null : aiProviders.defaultId,
        providers,
      }),
    };
    try {
      await onPersistProviders(nextConfig);
      onAiProvidersChange(nextConfig);
      if (configureId === entry.id) {
        closeConfigureModal();
      }
      toast({
        type: "success",
        description: `Cleared ${entry.label} configuration.`,
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to reset provider",
      });
    }
  };

  const handleDelete = async (entry: AiProviderEntry) => {
    if (isCanonicalSeedEntry(entry, aiProviders.providers)) {
      toast({
        type: "error",
        description: `${entry.label} is a built-in provider and cannot be removed.`,
      });
      return;
    }
    const providers = aiProviders.providers.filter(
      (provider) => provider.id !== entry.id,
    );
    const nextConfig = {
      providers,
      defaultId: resolveDefaultProviderId({
        defaultId:
          aiProviders.defaultId === entry.id ? null : aiProviders.defaultId,
        providers,
      }),
    };
    try {
      await onPersistProviders(nextConfig);
      onAiProvidersChange(nextConfig);
      if (configureId === entry.id) {
        closeConfigureModal();
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

  const handleSetDefault = async (entry: AiProviderEntry) => {
    if (
      !isProviderEntryConfigured(entry) ||
      aiProviders.defaultId === entry.id
    ) {
      return;
    }
    const nextConfig = {
      ...aiProviders,
      defaultId: entry.id,
    };
    try {
      await onPersistProviders(nextConfig);
      onAiProvidersChange(nextConfig);
      toast({
        type: "success",
        description: `${entry.label} is the default for new chats.`,
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Failed to set default",
      });
    }
  };

  if (showSkeletons) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-28 self-end" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium text-sm">Configured providers</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Add API keys and model options. The default is for new chats;
            existing chats keep their last provider.
          </p>
        </div>
        <Button
          onClick={openAddModal}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-4" />
          Add Provider
        </Button>
      </div>

      <ul className="divide-y divide-border/60 rounded-md border border-border/60">
        {aiProviders.providers.map((entry) => {
          const configured = isProviderEntryConfigured(entry);
          const isSeed = isCanonicalSeedEntry(entry, aiProviders.providers);
          const speedLabel = slotModelLabel(
            entry,
            "speed",
            aiProviders.providers,
          );
          const reasoningLabel = slotModelLabel(
            entry,
            "reasoning",
            aiProviders.providers,
          );
          const atStock =
            isSeed &&
            !configured &&
            entry.maxIterations === "10" &&
            !entry.speedModelId?.trim() &&
            !entry.reasoningModelId?.trim() &&
            !entry.baseUrl?.trim();
          const radioId = `ai-default-${entry.id}`;
          const isDefault = aiProviders.defaultId === entry.id;
          return (
            <li className="px-2.5 py-2" key={entry.id}>
              <div className="flex items-start gap-2.5">
                <input
                  checked={isDefault}
                  className="mt-1 size-3.5 shrink-0 accent-foreground disabled:opacity-40"
                  disabled={!configured}
                  id={radioId}
                  name="ai-default-provider"
                  onChange={() => {
                    void handleSetDefault(entry);
                  }}
                  type="radio"
                  value={entry.id}
                />
                <label
                  className={cn(
                    "min-w-0 flex-1",
                    configured ? "cursor-pointer" : "cursor-default",
                  )}
                  htmlFor={radioId}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium text-sm">
                      {entry.label}
                    </span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-medium text-[10px] leading-none",
                        configured
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                          : "border-border/80 bg-muted/50 text-muted-foreground",
                      )}
                    >
                      {configured ? "Configured" : "Not configured"}
                    </span>
                  </div>
                  <div className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground/80">
                    <p className="truncate">Speed · {speedLabel}</p>
                    <p className="truncate">Reasoning · {reasoningLabel}</p>
                  </div>
                </label>
                <div className="flex shrink-0 items-center">
                  <Button
                    aria-label={`Configure ${entry.label}`}
                    className="size-7"
                    onClick={() => openConfigureModal(entry)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  {isSeed ? (
                    <Button
                      aria-label={`Reset ${entry.label} to stock settings`}
                      className="size-7 text-muted-foreground hover:text-foreground"
                      disabled={atStock}
                      onClick={() => {
                        void handleResetSeed(entry);
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Eraser className="size-3.5" />
                    </Button>
                  ) : (
                    <Button
                      aria-label={`Remove ${entry.label}`}
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        void handleDelete(entry);
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <ProviderConfigDialog
        description={
          configureEntry
            ? `API key, models, and limits for ${configureEntry.label}.`
            : undefined
        }
        draft={draft}
        loadingModels={loadingModels}
        mode="configure"
        models={models}
        onChange={(patch) =>
          setDraft((previous) => ({ ...previous, ...patch }))
        }
        onOpenChange={(open) => {
          if (!open) {
            closeConfigureModal();
          }
        }}
        onReloadModels={() => {
          void handleReloadModels(draft);
        }}
        onReplaceDraft={setDraft}
        onSave={() => {
          void handleSaveConfigure();
        }}
        open={configureId != null}
        savedProviders={aiProviders.providers}
        saving={savingModal}
        showKey={showDraftKey}
        title={
          configureEntry
            ? `Configure ${configureEntry.label}`
            : "Configure provider"
        }
        onToggleKey={() => setShowDraftKey((value) => !value)}
      />

      <ProviderConfigDialog
        description="Add another provider account. Labels must be unique — leave blank to auto-name (e.g. Google (1))."
        draft={draft}
        loadingModels={loadingModels}
        mode="add"
        models={models}
        onChange={(patch) =>
          setDraft((previous) => ({ ...previous, ...patch }))
        }
        onOpenChange={setAddOpen}
        onReloadModels={() => {
          void handleReloadModels(draft);
        }}
        onReplaceDraft={setDraft}
        onSave={() => {
          void handleAdd();
        }}
        open={addOpen}
        savedProviders={aiProviders.providers}
        saving={savingModal}
        showKey={showDraftKey}
        title="Add AI Provider"
        onToggleKey={() => setShowDraftKey((value) => !value)}
      />
    </div>
  );
}

type ProviderConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  mode: "add" | "configure";
  draft: AiProviderEntry;
  onChange: (patch: Partial<AiProviderEntry>) => void;
  models: CustomModelOption[];
  loadingModels: boolean;
  onReloadModels: () => void;
  showKey: boolean;
  onToggleKey: () => void;
  saving: boolean;
  onSave: () => void;
  onReplaceDraft: (entry: AiProviderEntry) => void;
  savedProviders: AiProviderEntry[];
};

function ProviderConfigDialog({
  open,
  onOpenChange,
  title,
  description,
  mode,
  draft,
  onChange,
  models,
  loadingModels,
  onReloadModels,
  showKey,
  onToggleKey,
  saving,
  onSave,
  onReplaceDraft,
  savedProviders,
}: ProviderConfigDialogProps) {
  const maxIterationsId = useId();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[min(90vh,800px)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-border/60 border-b px-4 py-3 text-left sm:px-5">
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-xs">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="max-h-[min(70vh,640px)] overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
            {mode === "add" ? (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  onValueChange={(value: AiProviderType) => {
                    onReplaceDraft(emptyDraft(value));
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
            ) : null}

            {isCanonicalSeedEntry(draft, savedProviders) ? (
              <ModelSlotCards entry={draft} />
            ) : null}

            <ProviderFields
              entry={draft}
              hideLabel={
                mode === "configure" &&
                isCanonicalSeedEntry(draft, savedProviders)
              }
              hideMaxIterations={draft.type === "custom"}
              loadingModels={loadingModels}
              maxIterationsId={maxIterationsId}
              onChange={onChange}
              onReloadModels={onReloadModels}
              savedProviders={savedProviders}
              showKey={showKey}
              showLabelHint={mode === "add"}
              onToggleKey={onToggleKey}
            />

            {draft.type === "custom" ? (
              <>
                <ModelSlotsSection
                  key={draft.id}
                  entry={draft}
                  loadingModels={loadingModels}
                  models={models}
                  onChange={onChange}
                  onReloadModels={onReloadModels}
                  startInEditMode={mode === "add"}
                  variant="custom"
                />
                <MaxIterationsField
                  id={maxIterationsId}
                  onChange={(value) => onChange({ maxIterations: value })}
                  value={draft.maxIterations}
                />
              </>
            ) : null}

            {supportsHostedModelOverrides(draft, savedProviders) ? (
              <ModelSlotsSection
                key={draft.id}
                entry={draft}
                loadingModels={loadingModels}
                models={models}
                onChange={onChange}
                onReloadModels={onReloadModels}
                startInEditMode={false}
                variant="hosted-override"
              />
            ) : null}
          </div>
        </div>
        <DialogFooter className="gap-2 border-border/60 border-t px-4 py-3 sm:justify-end sm:px-5">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={
              saving ||
              (draft.type === "custom" &&
                (!draft.speedModelId?.trim() ||
                  !draft.reasoningModelId?.trim()))
            }
            onClick={onSave}
            type="button"
          >
            {saving ? (
              <>
                <LoaderIcon size={16} />
                Saving...
              </>
            ) : mode === "add" ? (
              "Add provider"
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function slotModelLabel(
  entry: AiProviderEntry,
  slot: "speed" | "reasoning",
  knownProviders?: readonly AiProviderEntry[],
): string {
  const overrideId =
    slot === "speed"
      ? entry.speedModelId?.trim()
      : entry.reasoningModelId?.trim();

  if (entry.type === "custom") {
    return overrideId || "—";
  }

  const registered = modelsForProvider(entry.type);
  if (entryUsesModelOverrides(entry, knownProviders) && overrideId) {
    return (
      registered.find((model) => model.apiModelId === overrideId)?.name ??
      overrideId
    );
  }

  return registered.find((model) => model.slot === slot)?.name ?? "—";
}

function ModelSlotCards({ entry }: { entry: AiProviderEntry }) {
  if (entry.type === "custom") {
    return null;
  }

  const models = modelsForProvider(entry.type);
  const speed = models.find((model) => model.slot === "speed");
  const reasoning = models.find((model) => model.slot === "reasoning");

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <ModelSlotCard label="Speed" value={speed?.name ?? "—"} />
      <ModelSlotCard label="Reasoning" value={reasoning?.name ?? "—"} />
    </div>
  );
}

function ModelSlotCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
      <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="break-all text-sm">{value}</p>
    </div>
  );
}

const HOSTED_MODEL_OVERRIDE_DISCLAIMER =
  "Overriding models is optional. Some models may not handle multi-step tool chains as reliably as the built-in pairings.";

function ModelSlotsSection({
  entry,
  models,
  loadingModels,
  onChange,
  onReloadModels,
  startInEditMode,
  variant,
}: {
  entry: AiProviderEntry;
  models: CustomModelOption[];
  loadingModels: boolean;
  onChange: (patch: Partial<AiProviderEntry>) => void;
  onReloadModels: () => void;
  startInEditMode: boolean;
  variant: "custom" | "hosted-override";
}) {
  const required = variant === "custom";
  const [editing, setEditing] = useState(startInEditMode);
  const lastReloadToken = useRef<string | null>(null);
  const hasOverrides = Boolean(
    entry.speedModelId?.trim() && entry.reasoningModelId?.trim(),
  );
  const reloadToken =
    variant === "custom"
      ? (entry.baseUrl?.trim() ?? "")
      : (entry.apiKey?.trim() ?? "");

  useEffect(() => {
    setEditing(startInEditMode);
    lastReloadToken.current = null;
  }, [startInEditMode]);

  useEffect(() => {
    if (!editing || !reloadToken) {
      return;
    }
    if (lastReloadToken.current === reloadToken) {
      return;
    }
    lastReloadToken.current = reloadToken;
    onReloadModels();
  }, [editing, onReloadModels, reloadToken]);

  const handleBeginEditing = () => {
    setEditing(true);
    if (!reloadToken) {
      return;
    }
    lastReloadToken.current = reloadToken;
    onReloadModels();
  };

  const handleResetDefaults = () => {
    onChange({ speedModelId: undefined, reasoningModelId: undefined });
    setEditing(false);
  };

  const modelLabel = (id: string) =>
    models.find((model) => model.id === id)?.name || id;

  if (!editing && hasOverrides) {
    return (
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <ModelSlotCard
            label="Speed"
            value={modelLabel(entry.speedModelId ?? "")}
          />
          <ModelSlotCard
            label="Reasoning"
            value={modelLabel(entry.reasoningModelId ?? "")}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Speed handles everyday tool calls. Reasoning handles multi-step MCP
          chains.
        </p>
        {variant === "hosted-override" ? (
          <p className="text-muted-foreground text-xs">
            {HOSTED_MODEL_OVERRIDE_DISCLAIMER}
          </p>
        ) : null}
        <Button
          disabled={loadingModels || !reloadToken}
          onClick={handleBeginEditing}
          size="sm"
          type="button"
          variant="outline"
        >
          {loadingModels ? "Loading models..." : "Update models"}
        </Button>
      </div>
    );
  }

  if (!editing && variant === "hosted-override") {
    return (
      <div className="space-y-2">
        <ModelSlotCards entry={entry} />
        <p className="text-muted-foreground text-xs">
          Using the built-in Speed and Reasoning pairing.
        </p>
        <p className="text-muted-foreground text-xs">
          {HOSTED_MODEL_OVERRIDE_DISCLAIMER}
        </p>
        <Button
          disabled={loadingModels || !reloadToken}
          onClick={handleBeginEditing}
          size="sm"
          type="button"
          variant="outline"
        >
          {loadingModels ? "Loading models..." : "Override models"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        Speed: fast model for everyday tool calls. Reasoning: stronger model for
        multi-step MCP chains.
      </p>
      {variant === "hosted-override" ? (
        <p className="text-muted-foreground text-xs">
          {HOSTED_MODEL_OVERRIDE_DISCLAIMER}
        </p>
      ) : null}
      {loadingModels ? (
        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          <span className="inline-block animate-spin">
            <LoaderIcon size={14} />
          </span>
          Loading models...
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Speed model</Label>
          <Select
            disabled={loadingModels || models.length === 0 || !reloadToken}
            onValueChange={(value) => onChange({ speedModelId: value })}
            value={entry.speedModelId || undefined}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select speed model" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
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
            disabled={loadingModels || models.length === 0 || !reloadToken}
            onValueChange={(value) => onChange({ reasoningModelId: value })}
            value={entry.reasoningModelId || undefined}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select reasoning model" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {models.map((model) => (
                <SelectItem key={`reason-${model.id}`} value={model.id}>
                  {model.name || model.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {required ? null : (
        <div className="flex items-center justify-between gap-2">
          <Button
            onClick={handleResetDefaults}
            size="sm"
            type="button"
            variant="ghost"
          >
            Use defaults
          </Button>
          {hasOverrides ? (
            <Button
              onClick={() => setEditing(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              Done
            </Button>
          ) : null}
        </div>
      )}
      {required && hasOverrides && !startInEditMode ? (
        <div className="flex justify-end">
          <Button
            onClick={() => setEditing(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Done
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function withResolvedLabel(
  draft: AiProviderEntry,
  existing: AiProviderEntry[],
  excludeId?: string,
): AiProviderEntry {
  const trimmedLabel = draft.label.trim();
  const label =
    trimmedLabel.length > 0
      ? ensureUniqueProviderLabel(trimmedLabel, existing, excludeId)
      : suggestedLabelForType(draft.type, existing);
  return { ...draft, label };
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
  if (findDuplicateProviderLabelInList(draft, existing)) {
    return `Provider label "${draft.label}" is already in use.`;
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

function findDuplicateProviderLabelInList(
  draft: AiProviderEntry,
  existing: AiProviderEntry[],
): boolean {
  const key = draft.label.trim().toLowerCase();
  return existing.some(
    (entry) =>
      entry.id !== draft.id && entry.label.trim().toLowerCase() === key,
  );
}

function ProviderFields({
  entry,
  onChange,
  showKey,
  onToggleKey,
  maxIterationsId,
  onReloadModels,
  loadingModels = false,
  hideLabel = false,
  hideMaxIterations = false,
  showLabelHint = false,
  savedProviders = [],
}: {
  entry: AiProviderEntry;
  onChange: (patch: Partial<AiProviderEntry>) => void;
  showKey: boolean;
  onToggleKey: () => void;
  maxIterationsId: string;
  onReloadModels: () => void;
  loadingModels?: boolean;
  hideLabel?: boolean;
  hideMaxIterations?: boolean;
  showLabelHint?: boolean;
  savedProviders?: readonly AiProviderEntry[];
}) {
  const keyId = `${entry.id}-api-key`;

  return (
    <div className="space-y-4">
      {hideLabel ? null : (
        <div className="space-y-2">
          <Label htmlFor={`${entry.id}-label`}>Label</Label>
          <Input
            id={`${entry.id}-label`}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder={
              entry.type === "custom"
                ? "custom: gateway"
                : `${defaultLabelForProviderType(entry.type)}: personal`
            }
            value={entry.label}
          />
          {showLabelHint ? (
            <p className="text-muted-foreground text-xs">
              Leave blank when adding to auto-name (e.g. Google (1)).
            </p>
          ) : null}
        </div>
      )}
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
          {isCanonicalSeedEntry(entry, savedProviders) ? (
            <Button
              disabled={loadingModels || !entry.apiKey?.trim()}
              onClick={onReloadModels}
              type="button"
              variant="outline"
            >
              {loadingModels ? "Testing..." : "Test API Key"}
            </Button>
          ) : null}
        </>
      )}
      {hideMaxIterations ? null : (
        <MaxIterationsField
          id={maxIterationsId}
          onChange={(value) => onChange({ maxIterations: value })}
          value={entry.maxIterations}
        />
      )}
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
    <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 dark:border-yellow-400/20 dark:bg-yellow-400/5">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400/70">
          <WarningIcon size={16} />
        </div>
        <div className="flex-1 space-y-1">
          <p className="font-medium text-sm text-yellow-900 dark:text-yellow-200">
            Organization Verification Required
          </p>
          <p className="text-xs text-yellow-800 dark:text-yellow-200/80">
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
