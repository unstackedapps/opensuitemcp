"use client";

import { useEffect, useState } from "react";
import {
  adminCreateLlmProvider,
  adminUpdateLlmProvider,
} from "@/app/admin/providers/actions";
import {
  emptyDraft,
  ProviderConfigDialog,
  validateDraft,
  withResolvedLabel,
} from "@/components/ai-provider-settings";
import { toast } from "@/components/toast";
import {
  type AiProviderEntry,
  defaultLabelForProviderType,
  HOSTED_PROVIDER_API_TEST_SUCCESS,
  isHostedCuratedProviderTest,
} from "@/lib/ai/provider-entries";
import type { OrgLlmProviderRow } from "@/lib/org/llm-providers";

function orgRowToEntry(row: OrgLlmProviderRow): AiProviderEntry {
  return {
    id: row.id,
    label:
      row.modeConfig.label?.trim() ||
      defaultLabelForProviderType(row.providerType),
    type: row.providerType,
    apiKey: row.hasOrgApiKey ? "org-managed" : "",
    maxIterations: row.modeConfig.maxIterations?.trim() || "10",
    baseUrl: row.modeConfig.baseUrl?.trim() || undefined,
    speedModelId: row.modeConfig.speedModelId?.trim() || undefined,
    reasoningModelId: row.modeConfig.reasoningModelId?.trim() || undefined,
  };
}

function orgRowsToEntries(rows: OrgLlmProviderRow[]): AiProviderEntry[] {
  return rows.map(orgRowToEntry);
}

async function reloadModelsForEntry(
  entry: AiProviderEntry,
  savedProviders: readonly AiProviderEntry[],
): Promise<{
  models: Array<{ id: string; name?: string }>;
  curatedKeyTest: boolean;
}> {
  const curatedKeyTest = isHostedCuratedProviderTest(entry, savedProviders);
  const apiKeyForTest =
    entry.apiKey === "org-managed" || !entry.apiKey?.trim()
      ? undefined
      : entry.apiKey;

  const response = await fetch("/api/settings/ai-providers/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: entry.type,
      baseUrl: entry.baseUrl,
      apiKey: apiKeyForTest ?? entry.apiKey,
    }),
  });

  const data = (await response.json()) as {
    models?: Array<{ id: string; name?: string }>;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to list models");
  }

  return { models: data.models ?? [], curatedKeyTest };
}

export function OrgLlmProviderAddDialog({
  open,
  onOpenChange,
  existingRows,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingRows: OrgLlmProviderRow[];
  onCreated: () => void;
}) {
  const savedProviders = orgRowsToEntries(existingRows);
  const [draft, setDraft] = useState<AiProviderEntry>(() =>
    emptyDraft("google"),
  );
  const [models, setModels] = useState<Array<{ id: string; name?: string }>>(
    [],
  );
  const [loadingModels, setLoadingModels] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(emptyDraft("google"));
      setModels([]);
      setShowKey(false);
    }
  }, [open]);

  const handleReloadModels = async (entry: AiProviderEntry) => {
    setLoadingModels(true);
    try {
      const { models: nextModels, curatedKeyTest } = await reloadModelsForEntry(
        entry,
        savedProviders,
      );
      if (curatedKeyTest) {
        setModels([]);
        toast({
          type: "success",
          description: HOSTED_PROVIDER_API_TEST_SUCCESS,
        });
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

  const handleSave = async () => {
    const entry = withResolvedLabel(draft, savedProviders);
    const validationError = validateDraft(entry, savedProviders);
    if (validationError) {
      toast({ type: "error", description: validationError });
      return;
    }

    setSaving(true);
    try {
      const result = await adminCreateLlmProvider({
        providerType: entry.type,
        label: entry.label,
        apiKey: entry.apiKey?.trim() || undefined,
        maxIterations: entry.maxIterations,
        baseUrl: entry.baseUrl,
        speedModelId: entry.speedModelId,
        reasoningModelId: entry.reasoningModelId,
      });
      if (!result.ok) {
        toast({
          type: "error",
          description: result.error ?? "Could not add provider.",
        });
        return;
      }
      toast({ type: "success", description: "Provider added." });
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProviderConfigDialog
      draft={draft}
      loadingModels={loadingModels}
      mode="add"
      models={models}
      onChange={(patch) => setDraft((previous) => ({ ...previous, ...patch }))}
      onOpenChange={onOpenChange}
      onReloadModels={() => {
        void handleReloadModels(draft);
      }}
      onReplaceDraft={setDraft}
      onSave={() => {
        void handleSave();
      }}
      open={open}
      savedProviders={savedProviders}
      saving={saving}
      showKey={showKey}
      title="Add AI Provider"
      onToggleKey={() => setShowKey((value) => !value)}
    />
  );
}

export function OrgLlmProviderEditDialog({
  open,
  onOpenChange,
  row,
  existingRows,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: OrgLlmProviderRow | null;
  existingRows: OrgLlmProviderRow[];
  onUpdated: () => void;
}) {
  const savedProviders = orgRowsToEntries(existingRows);
  const [draft, setDraft] = useState<AiProviderEntry>(() =>
    emptyDraft("google"),
  );
  const [models, setModels] = useState<Array<{ id: string; name?: string }>>(
    [],
  );
  const [loadingModels, setLoadingModels] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setDraft({
        ...orgRowToEntry(row),
        apiKey: "",
      });
      setModels([]);
      setShowKey(false);
    }
  }, [row]);

  if (!row) {
    return null;
  }

  const handleReloadModels = async (entry: AiProviderEntry) => {
    setLoadingModels(true);
    try {
      const { models: nextModels, curatedKeyTest } = await reloadModelsForEntry(
        {
          ...entry,
          apiKey: entry.apiKey?.trim() ? entry.apiKey : "org-managed",
        },
        savedProviders,
      );
      if (curatedKeyTest) {
        setModels([]);
        toast({
          type: "success",
          description: HOSTED_PROVIDER_API_TEST_SUCCESS,
        });
        return;
      }
      setModels(nextModels);
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

  const handleSave = async () => {
    const others = savedProviders.filter((provider) => provider.id !== row.id);
    const resolvedEntry = withResolvedLabel(draft, others, row.id);
    const validationError = validateDraft(resolvedEntry, others);
    if (validationError) {
      toast({ type: "error", description: validationError });
      return;
    }

    setSaving(true);
    try {
      const trimmedKey = resolvedEntry.apiKey?.trim();
      const result = await adminUpdateLlmProvider({
        providerId: row.id,
        label: resolvedEntry.label,
        apiKey:
          trimmedKey && trimmedKey !== "org-managed" ? trimmedKey : undefined,
        maxIterations: resolvedEntry.maxIterations,
        baseUrl: resolvedEntry.baseUrl,
        speedModelId: resolvedEntry.speedModelId,
        reasoningModelId: resolvedEntry.reasoningModelId,
      });
      if (!result.ok) {
        toast({
          type: "error",
          description: result.error ?? "Could not save provider.",
        });
        return;
      }
      toast({ type: "success", description: "Provider saved." });
      onOpenChange(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProviderConfigDialog
      draft={draft}
      loadingModels={loadingModels}
      mode="configure"
      models={models}
      onChange={(patch) => setDraft((previous) => ({ ...previous, ...patch }))}
      onOpenChange={onOpenChange}
      onReloadModels={() => {
        void handleReloadModels(draft);
      }}
      onReplaceDraft={setDraft}
      onSave={() => {
        void handleSave();
      }}
      open={open}
      savedProviders={savedProviders}
      saving={saving}
      showKey={showKey}
      title={`Configure ${draft.label}`}
      onToggleKey={() => setShowKey((value) => !value)}
    />
  );
}
