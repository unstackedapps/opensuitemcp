"use client";

import {
  ChevronDown,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Unplug,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAppPortal } from "@/components/portal/context";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PUBLIC_DOCS_ORIGIN } from "@/lib/constants";
import { skillsPackSyncEnabled } from "@/lib/product-features";
import { cn } from "@/lib/utils";
import { toast } from "./toast";

/** Official Oracle SuiteCloud Agent Skills pack on GitHub */
const ORACLE_SKILLS_GITHUB_URL =
  "https://github.com/oracle/netsuite-suitecloud-sdk/tree/master/packages/agent-skills";

/** Official Help Center docs for SuiteCloud Agent Skills */
const ORACLE_SKILLS_DOCS_URL =
  "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7122549123.html";

const COMMUNITY_SKILLS_GITHUB_URL =
  "https://github.com/unstackedapps/opensuitemcp-community-skills";

type CatalogSkill = {
  id: string;
  name: string;
  description: string;
  author: string;
  source: string;
  alwaysOn?: boolean;
  updatedAt: string;
  contentLength: number;
  slug?: string;
  sourceId?: string;
  connectionLabel?: string;
};

type CustomSkill = {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
  enabled?: boolean;
};

type ConnectedSource = {
  id: string;
  url: string;
  owner: string;
  repo: string;
  ref: string;
  path: string;
  label: string;
  lastSyncedAt: string;
  skillCount: number;
  lastError?: string | null;
};

type SkillsResponse = {
  catalog: CatalogSkill[];
  enabledSkillIds: string[];
  customSkills: CustomSkill[];
  connectedSources: ConnectedSource[];
  connectedSkills: CatalogSkill[];
};

type SkillsPanelProps = {
  active: boolean;
};

async function fetchSkills(): Promise<SkillsResponse> {
  const response = await fetch("/api/skills");
  if (!response.ok) {
    throw new Error("Failed to load skills");
  }
  return response.json();
}

async function persistSkillSettings(
  payload: Partial<Pick<SkillsResponse, "enabledSkillIds" | "customSkills">>,
) {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      typeof error.error === "string" ? error.error : "Failed to save skills",
    );
  }
}

function formatSkillDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SKILL_SKELETON_KEYS = [
  "skill-skel-a",
  "skill-skel-b",
  "skill-skel-c",
  "skill-skel-d",
  "skill-skel-e",
  "skill-skel-f",
] as const;

function SkillsListSkeleton() {
  return (
    <div className="space-y-2">
      {SKILL_SKELETON_KEYS.map((key) => (
        <Skeleton className="h-10 w-full" key={key} />
      ))}
    </div>
  );
}

type SkillRowProps = {
  name: string;
  updatedAt: string;
  author: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  actions?: React.ReactNode;
  /** Hide enable switch (Connected skills are slash-invoked) */
  hideSwitch?: boolean;
  /** When set, row can expand to preview SKILL.md / custom content */
  preview?:
    | { kind: "remote"; skillId: string }
    | { kind: "inline"; content: string };
};

function SkillRow({
  name,
  updatedAt,
  author,
  description,
  checked,
  disabled,
  onCheckedChange,
  actions,
  hideSwitch,
  preview,
}: SkillRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(
    preview?.kind === "inline" ? preview.content : null,
  );
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const canPreview = Boolean(preview);

  const handleToggleExpand = async () => {
    if (!preview) {
      return;
    }
    const next = !expanded;
    setExpanded(next);
    if (!next || content !== null || preview.kind === "inline") {
      return;
    }

    setIsLoadingContent(true);
    setContentError(null);
    try {
      const response = await fetch(
        `/api/skills/${encodeURIComponent(preview.skillId)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load skill content");
      }
      const payload = (await response.json()) as { content?: string };
      setContent(payload.content ?? "");
    } catch (error) {
      setContentError(
        error instanceof Error ? error.message : "Failed to load skill content",
      );
    } finally {
      setIsLoadingContent(false);
    }
  };

  return (
    <div className="border-b border-border/60 py-3 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <button
          className={cn(
            "min-w-0 text-left",
            canPreview && "rounded-md hover:bg-muted/40 -mx-1 px-1 py-0.5",
          )}
          disabled={!canPreview}
          onClick={() => void handleToggleExpand()}
          type="button"
        >
          <div className="flex items-center gap-1.5">
            {canPreview ? (
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                  expanded && "rotate-180",
                )}
              />
            ) : null}
            <p className="truncate font-medium text-sm">{name}</p>
          </div>
          {description ? (
            <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
              {description}
            </p>
          ) : null}
          <p className="mt-1 truncate text-muted-foreground/80 text-[11px]">
            {author}
            <span className="mx-1.5 text-border">·</span>
            {formatSkillDate(updatedAt)}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {hideSwitch ? null : (
            <Switch
              aria-label={`Toggle ${name}`}
              checked={checked}
              disabled={disabled}
              onCheckedChange={onCheckedChange}
            />
          )}
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 rounded-md border bg-muted/20">
          {isLoadingContent ? (
            <div className="flex items-center gap-2 px-3 py-4 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Loading SKILL.md…
            </div>
          ) : null}
          {contentError ? (
            <p className="px-3 py-4 text-destructive text-xs">{contentError}</p>
          ) : null}
          {content !== null && !isLoadingContent ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word px-3 py-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
              {content}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type CustomSkillEditorProps = {
  initialName?: string;
  initialContent?: string;
  title: string;
  onCancel: () => void;
  onSave: (name: string, content: string) => Promise<void>;
};

function CustomSkillEditor({
  initialName = "",
  initialContent = "",
  title,
  onCancel,
  onSave,
}: CustomSkillEditorProps) {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputId = useId();
  const nameInputId = useId();
  const contentInputId = useId();

  useEffect(() => {
    setName(initialName);
    setContent(initialContent);
  }, [initialName, initialContent]);

  const handleSave = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      toast({
        type: "error",
        description: "Skill content cannot be empty.",
      });
      return;
    }

    setIsSaving(true);
    try {
      await onSave(name.trim() || "Custom skill", trimmedContent);
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save custom skill",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 sm:px-5">
        <div>
          <p className="font-medium text-sm">{title}</p>
          <p className="text-muted-foreground text-xs">
            Add reusable skill instructions that are appended to your chat
            sessions when enabled.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={nameInputId}>Name</Label>
          <Input
            id={nameInputId}
            onChange={(event) => setName(event.target.value)}
            placeholder="Custom skill"
            value={name}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={contentInputId}>Content</Label>
            <div>
              <Input
                accept=".md"
                className="hidden"
                id={fileInputId}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const text = reader.result;
                    if (typeof text === "string") {
                      setContent(text);
                      if (!name.trim()) {
                        setName(file.name.replace(/\.md$/i, ""));
                      }
                      toast({
                        type: "success",
                        description: `Imported ${file.name}`,
                      });
                    }
                  };
                  reader.readAsText(file, "UTF-8");
                  event.target.value = "";
                }}
                type="file"
              />
              <Button
                onClick={() => document.getElementById(fileInputId)?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <Upload className="mr-1.5 size-3.5" />
                Import .md
              </Button>
            </div>
          </div>
          <Textarea
            className="min-h-40 font-mono text-sm"
            id={contentInputId}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write or import your custom skill instructions..."
            value={content}
          />
        </div>
      </div>
      <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-border/60 px-4 py-3 sm:px-5">
        <Button onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={isSaving}
          onClick={() => void handleSave()}
          type="button"
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function SkillsPanel({ active }: SkillsPanelProps) {
  const { closePortal } = useAppPortal();
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR(
    active ? "skills-settings" : null,
    fetchSkills,
  );

  const [enabledSkillIds, setEnabledSkillIds] = useState<string[]>([]);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [connectedSources, setConnectedSources] = useState<ConnectedSource[]>(
    [],
  );
  const [connectedSkills, setConnectedSkills] = useState<CatalogSkill[]>([]);
  const [connectUrl, setConnectUrl] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(
    null,
  );
  const [refreshingPack, setRefreshingPack] = useState<
    "oracle" | "community" | null
  >(null);
  const [disconnectingSourceId, setDisconnectingSourceId] = useState<
    string | null
  >(null);
  const [expandedConnectedIds, setExpandedConnectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<CustomSkill | null>(null);
  const [activeSection, setActiveSection] = useState<
    "oracle" | "community" | "custom" | "connected"
  >("oracle");
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(
    () => new Set(),
  );
  const initializedRef = useRef(false);
  const connectUrlId = useId();

  useEffect(() => {
    if (!active) {
      initializedRef.current = false;
      setEditorOpen(false);
      setEditingSkill(null);
      setActiveSection("oracle");
      setConnectUrl("");
      setExpandedConnectedIds(new Set());
      return;
    }

    if (data && !initializedRef.current) {
      setEnabledSkillIds(data.enabledSkillIds);
      setCustomSkills(data.customSkills);
      setConnectedSources(data.connectedSources ?? []);
      setConnectedSkills(data.connectedSkills ?? []);
      initializedRef.current = true;
    }
  }, [active, data]);

  useEffect(() => {
    if (error) {
      toast({
        type: "error",
        description: "Failed to load skills. Please try again.",
      });
    }
  }, [error]);

  const catalog = data?.catalog ?? [];
  const oracleCatalog = [...catalog]
    .filter((skill) => skill.source === "oracle")
    .sort((a, b) => {
      if (a.alwaysOn && !b.alwaysOn) {
        return -1;
      }
      if (!a.alwaysOn && b.alwaysOn) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  const communityCatalog = [...catalog]
    .filter((skill) => skill.source === "community")
    .sort((a, b) => a.name.localeCompare(b.name));

  const runPersist = useCallback(
    async (
      payload: Partial<
        Pick<SkillsResponse, "enabledSkillIds" | "customSkills">
      >,
      rollback: () => void,
    ) => {
      try {
        await persistSkillSettings(payload);
        await mutate(
          (current) =>
            current
              ? {
                  ...current,
                  enabledSkillIds:
                    payload.enabledSkillIds ?? current.enabledSkillIds,
                  customSkills: payload.customSkills ?? current.customSkills,
                }
              : current,
          { revalidate: false },
        );
      } catch (persistError) {
        rollback();
        toast({
          type: "error",
          description:
            persistError instanceof Error
              ? persistError.message
              : "Failed to save skills",
        });
      }
    },
    [mutate],
  );

  const handleCatalogToggle = async (skillId: string, checked: boolean) => {
    const previous = enabledSkillIds;
    const next = checked
      ? [...enabledSkillIds, skillId]
      : enabledSkillIds.filter((id) => id !== skillId);

    setPendingToggles((current) => new Set(current).add(skillId));
    setEnabledSkillIds(next);

    await runPersist({ enabledSkillIds: next }, () =>
      setEnabledSkillIds(previous),
    );

    setPendingToggles((current) => {
      const updated = new Set(current);
      updated.delete(skillId);
      return updated;
    });
  };

  const handleCustomToggle = async (skillId: string, checked: boolean) => {
    const previous = customSkills;
    const next = customSkills.map((skill) =>
      skill.id === skillId ? { ...skill, enabled: checked } : skill,
    );

    setPendingToggles((current) => new Set(current).add(skillId));
    setCustomSkills(next);

    await runPersist({ customSkills: next }, () => setCustomSkills(previous));

    setPendingToggles((current) => {
      const updated = new Set(current);
      updated.delete(skillId);
      return updated;
    });
  };

  const handleDeleteCustomSkill = async (skillId: string) => {
    const previous = customSkills;
    const next = customSkills.filter((skill) => skill.id !== skillId);
    setCustomSkills(next);
    await runPersist({ customSkills: next }, () => setCustomSkills(previous));
  };

  const handleSaveCustomSkill = async (name: string, content: string) => {
    const previous = customSkills;
    const now = new Date().toISOString();

    const next = editingSkill
      ? customSkills.map((skill) =>
          skill.id === editingSkill.id
            ? { ...skill, name, content, updatedAt: now }
            : skill,
        )
      : [
          ...customSkills,
          {
            id: crypto.randomUUID(),
            name,
            content,
            updatedAt: now,
            enabled: true,
          },
        ];

    setCustomSkills(next);
    await runPersist({ customSkills: next }, () => setCustomSkills(previous));
    setEditingSkill(null);
    setEditorOpen(false);
  };

  const applyConnectedPayload = (payload: {
    connectedSources?: ConnectedSource[];
    connectedSkills?: CatalogSkill[];
  }) => {
    if (payload.connectedSources) {
      setConnectedSources(payload.connectedSources);
    }
    if (payload.connectedSkills) {
      setConnectedSkills(payload.connectedSkills);
    }
    void mutate(
      (current) =>
        current
          ? {
              ...current,
              connectedSources:
                payload.connectedSources ?? current.connectedSources,
              connectedSkills:
                payload.connectedSkills ?? current.connectedSkills,
            }
          : current,
      { revalidate: false },
    );
    // Keep chat composer slash menu in sync
    void globalMutate("connected-slash-skills");
  };

  const handleConnect = async () => {
    const url = connectUrl.trim();
    if (!url) {
      toast({ type: "error", description: "Paste a GitHub repository URL." });
      return;
    }
    setIsConnecting(true);
    try {
      const response = await fetch("/api/skills/connected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to connect skills",
        );
      }
      applyConnectedPayload(payload);
      setConnectUrl("");
      if (typeof payload.source?.id === "string") {
        setExpandedConnectedIds((current) =>
          new Set(current).add(payload.source.id),
        );
      }
      toast({
        type: "success",
        description: `Connected ${payload.source?.skillCount ?? 0} skill(s). Invoke with / in chat.`,
      });
    } catch (connectError) {
      toast({
        type: "error",
        description:
          connectError instanceof Error
            ? connectError.message
            : "Failed to connect skills",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefreshSource = async (sourceId: string) => {
    setRefreshingSourceId(sourceId);
    try {
      const response = await fetch(
        `/api/skills/connected/${encodeURIComponent(sourceId)}/refresh`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({}));
      applyConnectedPayload(payload);
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to refresh",
        );
      }
      toast({ type: "success", description: "Skills refreshed." });
    } catch (refreshError) {
      toast({
        type: "error",
        description:
          refreshError instanceof Error
            ? refreshError.message
            : "Failed to refresh",
      });
    } finally {
      setRefreshingSourceId(null);
    }
  };

  const handleRefreshPack = async (pack: "oracle" | "community") => {
    setRefreshingPack(pack);
    try {
      const response = await fetch("/api/skills/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to refresh",
        );
      }
      await mutate();
      toast({
        type: "success",
        description:
          pack === "oracle"
            ? "Oracle skills refreshed."
            : "Community skills refreshed.",
      });
    } catch (refreshError) {
      toast({
        type: "error",
        description:
          refreshError instanceof Error
            ? refreshError.message
            : "Failed to refresh",
      });
    } finally {
      setRefreshingPack(null);
    }
  };

  const handleDisconnectSource = async (sourceId: string) => {
    setDisconnectingSourceId(sourceId);
    try {
      const response = await fetch(
        `/api/skills/connected/${encodeURIComponent(sourceId)}`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to disconnect",
        );
      }
      applyConnectedPayload(payload);
      setExpandedConnectedIds((current) => {
        const next = new Set(current);
        next.delete(sourceId);
        return next;
      });
      toast({ type: "success", description: "Disconnected." });
    } catch (disconnectError) {
      toast({
        type: "error",
        description:
          disconnectError instanceof Error
            ? disconnectError.message
            : "Failed to disconnect",
      });
    } finally {
      setDisconnectingSourceId(null);
    }
  };

  const showSkeletons = isLoading && !data;

  const skillsNav: Array<{
    id: "oracle" | "community" | "custom" | "connected";
    label: string;
  }> = [
    { id: "oracle", label: "Oracle" },
    { id: "community", label: "Community" },
    { id: "connected", label: "Connected" },
    { id: "custom", label: "Custom" },
  ];

  if (editorOpen) {
    return (
      <CustomSkillEditor
        initialContent={editingSkill?.content ?? ""}
        initialName={editingSkill?.name ?? ""}
        onCancel={() => {
          setEditorOpen(false);
          setEditingSkill(null);
        }}
        onSave={handleSaveCustomSkill}
        title={editingSkill ? "Edit custom skill" : "New custom skill"}
      />
    );
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-testid="skills-panel"
    >
      <div className="flex items-start justify-between gap-3 border-border/60 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 font-medium text-sm">
            <Sparkles className="size-3.5 text-muted-foreground" />
            Skills
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Changes apply to new messages. Click a skill to preview. Connected
            skills are invoked with / in chat.
          </p>
        </div>
        <div className="hidden shrink-0 flex-col gap-1 text-xs sm:flex">
          <a
            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            href={`${PUBLIC_DOCS_ORIGIN}/docs/skills`}
            rel="noopener noreferrer"
            target="_blank"
          >
            OpenSuiteMCP guide
            <ExternalLink className="size-3" />
          </a>
          {activeSection === "oracle" ? (
            <>
              <a
                className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                href={ORACLE_SKILLS_GITHUB_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                GitHub
                <ExternalLink className="size-3" />
              </a>
              <a
                className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                href={ORACLE_SKILLS_DOCS_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                SuiteCloud docs
                <ExternalLink className="size-3" />
              </a>
            </>
          ) : null}
          {activeSection === "community" ? (
            <a
              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              href={COMMUNITY_SKILLS_GITHUB_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Community GitHub
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-border/60 border-b px-4 py-3">
        {skillsNav.map((item) => (
          <button
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1.5 text-xs transition-colors",
              activeSection === item.id
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
            data-testid={`skills-tab-${item.id}`}
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
        {showSkeletons ? (
          <SkillsListSkeleton />
        ) : activeSection === "oracle" ? (
          <>
            {oracleCatalog.map((skill) => (
              <SkillRow
                author={skill.author}
                checked={skill.alwaysOn || enabledSkillIds.includes(skill.id)}
                description={skill.description}
                disabled={skill.alwaysOn || pendingToggles.has(skill.id)}
                key={skill.id}
                name={skill.name}
                onCheckedChange={
                  skill.alwaysOn
                    ? undefined
                    : (checked) => void handleCatalogToggle(skill.id, checked)
                }
                preview={{ kind: "remote", skillId: skill.id }}
                updatedAt={skill.updatedAt}
              />
            ))}
            {oracleCatalog.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No Oracle skills yet.
                {skillsPackSyncEnabled
                  ? " Use Refresh to pull the pack."
                  : " Contact the operator if the pack is missing."}
              </div>
            ) : null}
          </>
        ) : activeSection === "community" ? (
          <>
            {communityCatalog.map((skill) => (
              <SkillRow
                author={skill.author}
                checked={enabledSkillIds.includes(skill.id)}
                description={skill.description}
                disabled={pendingToggles.has(skill.id)}
                key={skill.id}
                name={skill.name}
                onCheckedChange={(checked) =>
                  void handleCatalogToggle(skill.id, checked)
                }
                preview={{ kind: "remote", skillId: skill.id }}
                updatedAt={skill.updatedAt}
              />
            ))}
            {communityCatalog.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No Community skills yet.
                {skillsPackSyncEnabled
                  ? " Use Refresh to pull the pack."
                  : " Contact the operator if the pack is missing."}
              </div>
            ) : null}
          </>
        ) : activeSection === "custom" ? (
          <>
            {customSkills.map((skill) => (
              <SkillRow
                actions={
                  <>
                    <Button
                      aria-label={`Edit ${skill.name}`}
                      className="size-7"
                      onClick={() => {
                        setEditingSkill(skill);
                        setEditorOpen(true);
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      aria-label={`Delete ${skill.name}`}
                      className="size-7 text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
                      onClick={() => void handleDeleteCustomSkill(skill.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                }
                author="You"
                checked={skill.enabled !== false}
                disabled={pendingToggles.has(skill.id)}
                key={skill.id}
                name={skill.name}
                onCheckedChange={(checked) =>
                  void handleCustomToggle(skill.id, checked)
                }
                preview={{ kind: "inline", content: skill.content }}
                updatedAt={skill.updatedAt}
              />
            ))}
            {customSkills.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No custom skills yet. Add one to tailor Ava for your workflows.
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor={connectUrlId}>GitHub skills URL</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={connectUrlId}
                  onChange={(event) => setConnectUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo/tree/main/skills/…"
                  value={connectUrl}
                />
                <Button
                  disabled={isConnecting}
                  onClick={() => void handleConnect()}
                  type="button"
                >
                  {isConnecting ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 size-3.5" />
                  )}
                  Connect
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Public repos only. Invoke synced skills with{" "}
                <code className="rounded bg-muted px-1">/skill-name</code> in
                chat (multiple allowed inline).
              </p>
            </div>

            {connectedSources.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-sm">
                No connected skill packs yet.
              </div>
            ) : (
              connectedSources.map((source) => {
                const skillsForSource = connectedSkills.filter(
                  (skill) => skill.sourceId === source.id,
                );
                const skillCount =
                  skillsForSource.length > 0
                    ? skillsForSource.length
                    : source.skillCount;
                const expanded = expandedConnectedIds.has(source.id);
                return (
                  <div
                    className="rounded-md border border-border/60"
                    key={source.id}
                  >
                    <div className="flex items-start gap-1 px-2 py-2">
                      <button
                        aria-expanded={expanded}
                        className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left hover:bg-muted/40"
                        onClick={() => {
                          setExpandedConnectedIds((current) => {
                            const next = new Set(current);
                            if (next.has(source.id)) {
                              next.delete(source.id);
                            } else {
                              next.add(source.id);
                            }
                            return next;
                          });
                        }}
                        type="button"
                      >
                        <div className="flex items-center gap-1.5">
                          <ChevronDown
                            className={cn(
                              "size-3.5 shrink-0 text-muted-foreground transition-transform",
                              expanded && "rotate-180",
                            )}
                          />
                          <p className="truncate font-medium text-sm">
                            {source.label}
                          </p>
                        </div>
                        <p className="mt-0.5 pl-5 text-muted-foreground text-[11px]">
                          {skillCount} skill{skillCount === 1 ? "" : "s"}
                          <span className="mx-1.5 text-border">·</span>
                          synced {formatSkillDate(source.lastSyncedAt)}
                        </p>
                        {source.lastError ? (
                          <p className="mt-1 pl-5 text-destructive text-xs">
                            {source.lastError}
                          </p>
                        ) : null}
                      </button>
                      <div className="flex shrink-0 gap-1 pt-0.5">
                        <Button
                          aria-label={`Refresh ${source.label}`}
                          className="size-7"
                          disabled={
                            refreshingSourceId === source.id ||
                            disconnectingSourceId === source.id
                          }
                          onClick={() => void handleRefreshSource(source.id)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          {refreshingSourceId === source.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          aria-label={`Disconnect ${source.label}`}
                          className="size-7 text-muted-foreground hover:text-red-500 dark:hover:text-red-400"
                          disabled={
                            refreshingSourceId === source.id ||
                            disconnectingSourceId === source.id
                          }
                          onClick={() => void handleDisconnectSource(source.id)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          {disconnectingSourceId === source.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Unplug className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {expanded ? (
                      <div className="border-border/60 border-t px-3">
                        {skillsForSource.map((skill) => (
                          <SkillRow
                            author={source.label}
                            checked={false}
                            description={
                              skill.slug
                                ? `/${skill.slug} — ${skill.description}`
                                : skill.description
                            }
                            hideSwitch
                            key={skill.id}
                            name={skill.name}
                            preview={{ kind: "remote", skillId: skill.id }}
                            updatedAt={skill.updatedAt}
                          />
                        ))}
                        {skillsForSource.length === 0 ? (
                          <p className="py-3 text-muted-foreground text-xs">
                            No SKILL.md files cached. Try Refresh.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <DialogFooter
        className={cn(
          "flex-row items-center justify-between gap-2 border-t border-border/60 px-4 py-3 sm:justify-between sm:px-5",
        )}
      >
        {activeSection === "custom" ? (
          <Button
            onClick={() => {
              setEditingSkill(null);
              setEditorOpen(true);
            }}
            type="button"
            variant="outline"
          >
            <Plus className="mr-1.5 size-4" />
            Add a custom skill
          </Button>
        ) : activeSection === "oracle" || activeSection === "community" ? (
          skillsPackSyncEnabled ? (
            <Button
              disabled={refreshingPack !== null}
              onClick={() => void handleRefreshPack(activeSection)}
              type="button"
              variant="outline"
            >
              {refreshingPack === activeSection ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-4" />
              )}
              Refresh
            </Button>
          ) : (
            <span />
          )
        ) : (
          <span />
        )}
        <Button onClick={() => closePortal()} type="button">
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
