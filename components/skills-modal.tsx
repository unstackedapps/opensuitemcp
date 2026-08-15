"use client";

import {
  ChevronDown,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import useSWR from "swr";
import { useAppPortal } from "@/components/portal/context";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "./toast";

/** Official Oracle SuiteCloud Agent Skills pack on GitHub */
const ORACLE_SKILLS_GITHUB_URL =
  "https://github.com/oracle/netsuite-suitecloud-sdk/tree/master/packages/agent-skills";

/** Official Help Center docs for SuiteCloud Agent Skills */
const ORACLE_SKILLS_DOCS_URL =
  "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7122549123.html";

type CatalogSkill = {
  id: string;
  name: string;
  description: string;
  author: string;
  source: string;
  alwaysOn?: boolean;
  updatedAt: string;
  contentLength: number;
};

type CustomSkill = {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
  enabled?: boolean;
};

type SkillsResponse = {
  catalog: CatalogSkill[];
  enabledSkillIds: string[];
  customSkills: CustomSkill[];
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
  /** When set, row can expand to preview SKILL.md / custom content */
  preview?:
    | { kind: "oracle"; skillId: string }
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
      const response = await fetch(`/api/skills/${preview.skillId}`);
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
          <Switch
            aria-label={`Toggle ${name}`}
            checked={checked}
            disabled={disabled}
            onCheckedChange={onCheckedChange}
          />
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
  const { data, error, isLoading, mutate } = useSWR(
    active ? "skills-settings" : null,
    fetchSkills,
  );

  const [enabledSkillIds, setEnabledSkillIds] = useState<string[]>([]);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<CustomSkill | null>(null);
  const [activeSection, setActiveSection] = useState<"oracle" | "custom">(
    "oracle",
  );
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(
    () => new Set(),
  );
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      initializedRef.current = false;
      setEditorOpen(false);
      setEditingSkill(null);
      setActiveSection("oracle");
      return;
    }

    if (data && !initializedRef.current) {
      setEnabledSkillIds(data.enabledSkillIds);
      setCustomSkills(data.customSkills);
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
  const sortedCatalog = [...catalog].sort((a, b) => {
    if (a.alwaysOn && !b.alwaysOn) {
      return -1;
    }
    if (!a.alwaysOn && b.alwaysOn) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

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

  const showSkeletons = isLoading && !data;

  const skillsNav: Array<{ id: "oracle" | "custom"; label: string }> = [
    { id: "oracle", label: "Oracle" },
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-border/60 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 font-medium text-sm">
            <Sparkles className="size-3.5 text-muted-foreground" />
            Skills
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Changes apply to new messages. Click a skill to preview.
          </p>
        </div>
        <div className="hidden shrink-0 flex-col gap-1 text-xs sm:flex">
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
            {sortedCatalog.map((skill) => (
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
                preview={{ kind: "oracle", skillId: skill.id }}
                updatedAt={skill.updatedAt}
              />
            ))}
            {sortedCatalog.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No Oracle skills available yet.
              </div>
            ) : null}
          </>
        ) : (
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
                      className="size-7 text-muted-foreground hover:text-destructive"
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
        )}
      </div>

      <DialogFooter
        className={cn(
          "flex-row items-center justify-between gap-2 border-t border-border/60 px-4 py-3 sm:justify-between sm:px-5",
        )}
      >
        <Button
          onClick={() => {
            setActiveSection("custom");
            setEditingSkill(null);
            setEditorOpen(true);
          }}
          type="button"
          variant="outline"
        >
          <Plus className="mr-1.5 size-4" />
          Add a custom skill
        </Button>
        <Button onClick={() => closePortal()} type="button">
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
