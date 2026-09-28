"use client";

import {
  Blocks,
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Files,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unplug,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { Response } from "@/components/message-elements/response";
import { OnboardingPanelSkeleton } from "@/components/onboarding/onboarding-panel-skeleton";
import { OnboardingStepProse } from "@/components/onboarding/onboarding-step-prose";
import { useOptionalAppPortal } from "@/components/portal/context";
import { SkillModeSelect } from "@/components/skill-mode-select";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseSkillFrontmatter, readSkillZip } from "@/lib/ai/skills/bundle";
import {
  applySkillModeChange,
  resolveSkillMode,
  type SkillInvocationMode,
  type SkillKind,
  type SkillModesMap,
  slugifySkillName,
} from "@/lib/ai/skills/modes";
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

type AgentAuthor = {
  keyId: string;
  keyName: string;
  connectsFrom?: string | null;
  netsuiteAccountId?: string | null;
  at: string;
};

type CustomSkill = {
  id: string;
  name: string;
  content: string;
  description?: string;
  updatedAt: string;
  enabled?: boolean;
  managedByOrg?: boolean;
  slug?: string;
  agentAuthor?: AgentAuthor;
  files?: string[];
  /**
   * Declared here as well as on the server: this panel PUTs the whole list
   * back on every save, so a field the client type omits is dropped from
   * every skill it touches.
   */
  authoredBy?: "agent";
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
  /** Org mode: whether this user has the pack enabled */
  userEnabled?: boolean;
};

type PairedPersona = { id: string; name: string };

type SkillsResponse = {
  catalog: CatalogSkill[];
  enabledSkillIds: string[];
  skillModes?: SkillModesMap;
  customSkills: CustomSkill[];
  connectedSources: ConnectedSource[];
  connectedSkills: CatalogSkill[];
  disabledOrgConnectedSkillSourceIds?: string[];
  orgSkillsPolicy?: { managedByOrg: boolean };
  /** Personas a skill can be carried by, and which carry which. */
  personas?: PairedPersona[];
  personaSkillIds?: Record<string, string[]>;
};

type SkillSection = "oracle" | "community" | "custom" | "connected";

type SkillsPanelEmbedded = {
  title: string;
  description: ReactNode;
};

type SkillsPanelProps = {
  active: boolean;
  embedded?: boolean | SkillsPanelEmbedded;
  sections?: SkillSection[];
  onSettingsChange?: () => void | Promise<void>;
};

function applyDisabledConnectedPacks(
  current: SkillsResponse,
  disabledIds: string[],
): SkillsResponse {
  const disabled = new Set(disabledIds);
  return {
    ...current,
    disabledOrgConnectedSkillSourceIds: disabledIds,
    connectedSources: current.connectedSources.map((source) => ({
      ...source,
      userEnabled: !disabled.has(source.id),
    })),
  };
}

async function fetchSkills(): Promise<SkillsResponse> {
  const response = await fetch("/api/skills");
  if (!response.ok) {
    throw new Error("Failed to load skills");
  }
  return response.json();
}

async function persistSkillSettings(
  payload: Partial<
    Pick<
      SkillsResponse,
      | "enabledSkillIds"
      | "customSkills"
      | "skillModes"
      | "disabledOrgConnectedSkillSourceIds"
      | "personaSkillIds"
    >
  >,
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

function SkillsListSkeleton() {
  return (
    <OnboardingPanelSkeleton
      rowClassName="h-10 w-full"
      rows={6}
      showHeader={false}
    />
  );
}

type SkillRowProps = {
  name: string;
  updatedAt: string;
  author: string;
  description?: string;
  mode: SkillInvocationMode;
  /** Non-toggleable (e.g. always-on); uses default cursor, not not-allowed */
  disabled?: boolean;
  /** Save in flight — blocks clicks without the disabled/not-allowed cursor */
  pending?: boolean;
  onModeChange?: (mode: SkillInvocationMode) => void;
  actions?: React.ReactNode;
  hideMode?: boolean;
  /** When set, row can expand to preview SKILL.md / custom content */
  preview?:
    | { kind: "remote"; skillId: string }
    | { kind: "inline"; content: string };
  /** Personas that bring this skill into a turn. */
  carriedBy?: PairedPersona[];
  /** Reference file paths beside SKILL.md. */
  files?: string[];
  /** Needed to fetch a reference file's body. */
  skillId?: string;
  variant?: "list" | "card";
};

function SkillRow({
  name,
  updatedAt,
  author,
  description,
  mode,
  disabled,
  pending,
  onModeChange,
  actions,
  hideMode,
  preview,
  carriedBy,
  files,
  skillId,
  variant = "list",
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
    <div
      className={cn(
        variant === "card"
          ? "rounded-md border border-border/60 p-3"
          : "border-b border-border/60 py-3 last:border-b-0",
      )}
    >
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
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
            {files && files.length > 0 ? (
              <>
                <span className="mx-1.5 text-border">·</span>
                SKILL.md + {files.length} reference
                {files.length === 1 ? "" : "s"}
              </>
            ) : null}
            {carriedBy && carriedBy.length > 0 ? (
              <>
                <span className="mx-1.5 text-border">·</span>
                {carriedBy.map((persona) => persona.name).join(", ")}
              </>
            ) : null}
          </p>
        </button>
        <div className="flex shrink-0 items-center justify-end gap-1">
          {actions}
          {hideMode ? null : (
            <SkillModeSelect
              disabled={disabled}
              name={name}
              onChange={(next) => onModeChange?.(next)}
              pending={pending}
              value={mode}
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
          {files && files.length > 0 && skillId ? (
            <div className="border-border/60 border-t">
              {files.map((path) => (
                <SkillReferenceFile key={path} path={path} skillId={skillId} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One reference file, fetched when it is opened.
 *
 * Bodies are not carried by the skills payload — a bundle's references are
 * large and read rarely, which is the reason they live in their own table.
 */
function SkillReferenceFile({
  skillId,
  path,
}: {
  skillId: string;
  path: string;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || content !== null) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/skills/${encodeURIComponent(skillId)}/files`,
      );
      if (!response.ok) {
        throw new Error("Failed to load");
      }
      const payload = (await response.json()) as {
        files?: Array<{ path: string; content: string }>;
      };
      const match = payload.files?.find((file) => file.path === path);
      setContent(match?.content ?? "");
    } catch {
      setError("Failed to load this file.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-border/60 border-b last:border-b-0">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
        onClick={() => void toggle()}
        type="button"
      >
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {path}
        </span>
      </button>
      {open ? (
        <div className="px-3 pb-2">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Loading {path}…
            </div>
          ) : null}
          {error ? (
            <p className="py-2 text-destructive text-xs">{error}</p>
          ) : null}
          {content !== null && !loading ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground leading-relaxed">
              {content}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Personas that carry this skill, named for the row and the warnings. */
function personasCarrying(
  skillId: string,
  personaSkillIds: Record<string, string[]>,
  personas: PairedPersona[],
): PairedPersona[] {
  return Object.entries(personaSkillIds)
    .filter(([, skillIds]) => skillIds.includes(skillId))
    .map(([personaId]) => ({
      id: personaId,
      name:
        personas.find((persona) => persona.id === personaId)?.name ?? personaId,
    }));
}

function releaseSkill(
  skillId: string,
  personaSkillIds: Record<string, string[]>,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [personaId, skillIds] of Object.entries(personaSkillIds)) {
    const kept = skillIds.filter((id) => id !== skillId);
    if (kept.length > 0) {
      next[personaId] = kept;
    }
  }
  return next;
}

/** Who to credit, and who to ask before changing it. */
function customSkillAuthor(skill: CustomSkill): string {
  if (skill.managedByOrg) {
    return "Organization";
  }
  if (skill.agentAuthor) {
    const { keyName, connectsFrom } = skill.agentAuthor;
    return connectsFrom ? `${keyName} · ${connectsFrom}` : keyName;
  }
  return skill.authoredBy === "agent" ? "An agent" : "You";
}

type SkillDraftFiles = Array<{ path: string; content: string }>;

type CustomSkillEditorProps = {
  initialName?: string;
  initialContent?: string;
  initialDescription?: string;
  initialFiles?: SkillDraftFiles;
  title: string;
  onCancel: () => void;
  onSave: (draft: {
    name: string;
    content: string;
    description: string;
    files: SkillDraftFiles;
  }) => Promise<void>;
};

function CustomSkillEditor({
  initialName = "",
  initialContent = "",
  initialDescription = "",
  initialFiles,
  title,
  onCancel,
  onSave,
}: CustomSkillEditorProps) {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState(initialContent);
  const [description, setDescription] = useState(initialDescription);
  const [files, setFiles] = useState<SkillDraftFiles>(initialFiles ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputId = useId();
  const nameInputId = useId();
  const descriptionInputId = useId();
  const contentInputId = useId();

  useEffect(() => {
    setName(initialName);
    setContent(initialContent);
    setDescription(initialDescription);
    setFiles(initialFiles ?? []);
    setShowPreview(false);
  }, [initialName, initialContent, initialDescription, initialFiles]);

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
      await onSave({
        name: name.trim() || "Custom skill",
        content: trimmedContent,
        description: description.trim(),
        files,
      });
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
        <div className="grid gap-4 sm:grid-cols-2">
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
            <Label htmlFor={descriptionInputId}>Description</Label>
            <Input
              id={descriptionInputId}
              maxLength={280}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this skill is for"
              value={description}
            />
          </div>
        </div>
        {files.length > 0 ? (
          <div className="space-y-2">
            <Label>Reference files</Label>
            <ul className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
              {files.map((file) => (
                <li
                  className="flex items-center justify-between gap-2 text-muted-foreground text-xs"
                  key={file.path}
                >
                  <span className="truncate font-mono">{file.path}</span>
                  <Button
                    aria-label={`Remove ${file.path}`}
                    className="size-6 shrink-0"
                    onClick={() => {
                      setFiles((current) =>
                        current.filter((entry) => entry.path !== file.path),
                      );
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={contentInputId}>Content</Label>
            <div className="flex items-center gap-2">
              <Input
                accept=".md,.zip"
                className="hidden"
                id={fileInputId}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    return;
                  }

                  // A zip is a skill folder: SKILL.md plus what it points at.
                  if (file.name.toLowerCase().endsWith(".zip")) {
                    void file.arrayBuffer().then((buffer) => {
                      const result = readSkillZip(new Uint8Array(buffer));
                      if (!result.ok) {
                        toast({ type: "error", description: result.error });
                        return;
                      }
                      const parsed = parseSkillFrontmatter(
                        result.bundle.content,
                      );
                      setContent(result.bundle.content);
                      setFiles(result.bundle.files);
                      if (parsed.name && !name.trim()) {
                        setName(parsed.name);
                      } else if (!name.trim()) {
                        setName(file.name.replace(/\.zip$/i, ""));
                      }
                      if (parsed.description && !description.trim()) {
                        setDescription(parsed.description);
                      }
                      toast({
                        type: "success",
                        description: `Imported ${file.name}${result.bundle.files.length > 0 ? ` with ${result.bundle.files.length} reference file${result.bundle.files.length === 1 ? "" : "s"}` : ""}`,
                      });
                    });
                    return;
                  }

                  const reader = new FileReader();
                  reader.onload = () => {
                    const text = reader.result;
                    if (typeof text === "string") {
                      const parsed = parseSkillFrontmatter(text);
                      setContent(text);
                      if (!name.trim()) {
                        setName(parsed.name || file.name.replace(/\.md$/i, ""));
                      }
                      if (parsed.description && !description.trim()) {
                        setDescription(parsed.description);
                      }
                      toast({
                        type: "success",
                        description: `Imported ${file.name}`,
                      });
                    }
                  };
                  reader.readAsText(file, "UTF-8");
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
                Import .md or .zip
              </Button>
              <Button
                aria-label={showPreview ? "Edit skill" : "Preview skill"}
                onClick={() => {
                  setShowPreview((current) => !current);
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {showPreview ? (
                  <EyeOff className="mr-1.5 size-3.5" />
                ) : (
                  <Eye className="mr-1.5 size-3.5" />
                )}
                Preview
              </Button>
            </div>
          </div>
          {showPreview ? (
            <div className="h-64 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-3 text-sm md:h-80">
              <Response>{content}</Response>
            </div>
          ) : (
            <Textarea
              className="min-h-64 flex-1 resize-y text-sm md:min-h-80"
              id={contentInputId}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write or import your custom skill instructions..."
              rows={14}
              value={content}
            />
          )}
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

type PendingDestructive = {
  title: string;
  description: string;
  confirmLabel: string;
  /** Red is for what cannot be undone; a confirm that creates uses default. */
  variant?: "destructive" | "default";
  onConfirm: () => void | Promise<void>;
};

export function SkillsPanel({
  active,
  embedded = false,
  sections,
  onSettingsChange,
}: SkillsPanelProps) {
  const embeddedHeader =
    typeof embedded === "object" && embedded !== null ? embedded : undefined;
  const embeddedMode = Boolean(embedded);
  const portal = useOptionalAppPortal();
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR(
    active ? "skills-settings" : null,
    fetchSkills,
  );

  const [enabledSkillIds, setEnabledSkillIds] = useState<string[]>([]);
  const [skillModes, setSkillModes] = useState<SkillModesMap>({});
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [connectedSources, setConnectedSources] = useState<ConnectedSource[]>(
    [],
  );
  const [connectedSkills, setConnectedSkills] = useState<CatalogSkill[]>([]);
  const [
    disabledOrgConnectedSkillSourceIds,
    setDisabledOrgConnectedSkillSourceIds,
  ] = useState<string[]>([]);
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
  const [seedSkill, setSeedSkill] = useState<CustomSkill | null>(null);
  const [editorFiles, setEditorFiles] = useState<SkillDraftFiles>([]);
  const [personaSkillIds, setPersonaSkillIds] = useState<
    Record<string, string[]>
  >({});
  const [activeSection, setActiveSection] = useState<SkillSection>(
    sections?.[0] ?? "oracle",
  );
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingDestructive, setPendingDestructive] =
    useState<PendingDestructive | null>(null);
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
      setSkillModes(data.skillModes ?? {});
      setCustomSkills(data.customSkills);
      setPersonaSkillIds(data.personaSkillIds ?? {});
      setConnectedSources(data.connectedSources ?? []);
      setConnectedSkills(data.connectedSkills ?? []);
      setDisabledOrgConnectedSkillSourceIds(
        data.disabledOrgConnectedSkillSourceIds ?? [],
      );
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
  const orgManaged = data?.orgSkillsPolicy?.managedByOrg ?? false;
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
        Pick<
          SkillsResponse,
          | "enabledSkillIds"
          | "customSkills"
          | "skillModes"
          | "disabledOrgConnectedSkillSourceIds"
          | "personaSkillIds"
        >
      >,
      rollback: () => void,
    ) => {
      try {
        await persistSkillSettings(payload);
        await mutate(
          (current) => {
            if (!current) {
              return current;
            }

            let next: SkillsResponse = {
              ...current,
              enabledSkillIds:
                payload.enabledSkillIds ?? current.enabledSkillIds,
              skillModes: payload.skillModes ?? current.skillModes,
              customSkills: payload.customSkills ?? current.customSkills,
              disabledOrgConnectedSkillSourceIds:
                payload.disabledOrgConnectedSkillSourceIds ??
                current.disabledOrgConnectedSkillSourceIds,
              personaSkillIds:
                payload.personaSkillIds ?? current.personaSkillIds,
            };

            if (payload.disabledOrgConnectedSkillSourceIds !== undefined) {
              next = applyDisabledConnectedPacks(
                next,
                payload.disabledOrgConnectedSkillSourceIds,
              );
            }

            return next;
          },
          { revalidate: false },
        );
        await onSettingsChange?.();
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
    [mutate, onSettingsChange],
  );

  const handleConnectedPackToggle = async (
    sourceId: string,
    checked: boolean,
  ) => {
    if (pendingToggles.has(sourceId)) {
      return;
    }

    const previousDisabled = disabledOrgConnectedSkillSourceIds;
    const previousSources = connectedSources;
    const nextDisabled = checked
      ? previousDisabled.filter((id) => id !== sourceId)
      : [...previousDisabled.filter((id) => id !== sourceId), sourceId];
    const nextSources = connectedSources.map((source) =>
      source.id === sourceId ? { ...source, userEnabled: checked } : source,
    );

    setPendingToggles((current) => new Set(current).add(sourceId));
    setDisabledOrgConnectedSkillSourceIds(nextDisabled);
    setConnectedSources(nextSources);

    await runPersist(
      { disabledOrgConnectedSkillSourceIds: nextDisabled },
      () => {
        setDisabledOrgConnectedSkillSourceIds(previousDisabled);
        setConnectedSources(previousSources);
      },
    );

    void globalMutate("slashable-skills");

    setPendingToggles((current) => {
      const updated = new Set(current);
      updated.delete(sourceId);
      return updated;
    });
  };

  const applySkillMode = async (
    skillId: string,
    kind: SkillKind,
    mode: SkillInvocationMode,
    releasePairings: boolean,
  ) => {
    const previousModes = skillModes;
    const previousEnabled = enabledSkillIds;
    const previousCustom = customSkills;
    const next = applySkillModeChange({
      skillId,
      kind,
      mode,
      skillModes,
      enabledSkillIds,
      customSkills,
    });

    const previousPairings = personaSkillIds;
    const nextPairings = releasePairings
      ? releaseSkill(skillId, personaSkillIds)
      : personaSkillIds;

    setPendingToggles((current) => new Set(current).add(skillId));
    setSkillModes(next.skillModes);
    setEnabledSkillIds(next.enabledSkillIds);
    setCustomSkills(next.customSkills);
    if (releasePairings) {
      setPersonaSkillIds(nextPairings);
    }

    await runPersist(
      {
        skillModes: next.skillModes,
        enabledSkillIds: next.enabledSkillIds,
        ...(kind === "custom" ? { customSkills: next.customSkills } : {}),
        ...(releasePairings ? { personaSkillIds: nextPairings } : {}),
      },
      () => {
        setSkillModes(previousModes);
        setEnabledSkillIds(previousEnabled);
        setCustomSkills(previousCustom);
        setPersonaSkillIds(previousPairings);
      },
    );

    void globalMutate("slashable-skills");

    setPendingToggles((current) => {
      const updated = new Set(current);
      updated.delete(skillId);
      return updated;
    });
  };

  const handleSkillModeChange = async (
    skillId: string,
    kind: SkillKind,
    mode: SkillInvocationMode,
  ) => {
    if (pendingToggles.has(skillId)) {
      return;
    }

    // Off is the one mode a paired skill cannot hold: a persona carrying it
    // would inject nothing. Ask, then release.
    const carriers =
      mode === "off"
        ? personasCarrying(skillId, personaSkillIds, data?.personas ?? [])
        : [];
    if (carriers.length > 0) {
      const skillName =
        customSkills.find((item) => item.id === skillId)?.name ??
        data?.catalog.find((item) => item.id === skillId)?.name ??
        "this skill";
      setPendingDestructive({
        confirmLabel: "Switch off",
        description: `${carriers.map((persona) => persona.name).join(", ")} ${carriers.length === 1 ? "carries" : "carry"} ${skillName}. Switching it off removes ${carriers.length === 1 ? "that pairing" : "those pairings"}.`,
        onConfirm: () => {
          void applySkillMode(skillId, kind, mode, true);
        },
        title: `Switch off ${skillName}?`,
      });
      return;
    }

    await applySkillMode(skillId, kind, mode, false);
  };

  const handleDeleteCustomSkill = async (skillId: string) => {
    const skill = customSkills.find((item) => item.id === skillId);
    if (skill?.managedByOrg) {
      return;
    }
    const previous = customSkills;
    const previousPairings = personaSkillIds;
    const next = customSkills.filter((item) => item.id !== skillId);
    // The personas carrying it stay; they release this skill.
    const nextPairings = releaseSkill(skillId, personaSkillIds);
    setCustomSkills(next);
    setPersonaSkillIds(nextPairings);
    await runPersist(
      { customSkills: next, personaSkillIds: nextPairings },
      () => {
        setCustomSkills(previous);
        setPersonaSkillIds(previousPairings);
      },
    );
    void globalMutate("slashable-skills");
  };

  /** Clone lands as a personal skill this user owns, whatever it came from. */
  const openCloneCustomSkill = (skill: CustomSkill) => {
    setPendingDestructive({
      confirmLabel: "Clone",
      variant: "default",
      description: skill.managedByOrg
        ? `${skill.name} is published by your organization. The copy is yours to edit, and stops following the original.`
        : `Copies ${skill.name} into a skill you own, at Auto.`,
      onConfirm: () => {
        handleCloneCustomSkill(skill);
      },
      title: `Clone ${skill.name}?`,
    });
  };

  const handleCloneCustomSkill = (skill: CustomSkill) => {
    const personal = customSkills.filter((item) => !item.managedByOrg);
    if (personal.length >= 32) {
      toast({
        type: "error",
        description: "Limit reached — delete a custom skill before cloning.",
      });
      return;
    }
    setEditingSkill(null);
    setSeedSkill({
      id: crypto.randomUUID(),
      name: `${skill.name} copy`,
      content: skill.content,
      description: skill.description,
      updatedAt: new Date().toISOString(),
      enabled: true,
    });
    setEditorFiles([]);
    setEditorOpen(true);
    if (skill.files?.length) {
      void fetch(`/api/skills/${encodeURIComponent(skill.id)}/files`)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (Array.isArray(payload?.files)) {
            setEditorFiles(payload.files);
          }
        });
    }
  };

  const handleSaveCustomSkill = async (draft: {
    name: string;
    content: string;
    description: string;
    files: SkillDraftFiles;
  }) => {
    if (editingSkill?.managedByOrg) {
      return;
    }
    const { name, content, description, files } = draft;
    const previous = customSkills;
    const now = new Date().toISOString();
    const skillId = editingSkill?.id ?? seedSkill?.id ?? crypto.randomUUID();

    const next = editingSkill
      ? customSkills.map((skill) =>
          skill.id === editingSkill.id
            ? {
                ...skill,
                name,
                content,
                description: description || undefined,
                files: files.map((file) => file.path),
                updatedAt: now,
              }
            : skill,
        )
      : [
          ...customSkills,
          {
            id: skillId,
            name,
            content,
            description: description || undefined,
            files: files.map((file) => file.path),
            updatedAt: now,
            enabled: true,
            slug: slugifySkillName(name),
          },
        ];

    // Reference files live in their own table, so they are written separately
    // and only when the bundle actually changed.
    try {
      await fetch(`/api/skills/${encodeURIComponent(skillId)}/files`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
    } catch {
      toast({
        type: "error",
        description: "Failed to save the skill's reference files",
      });
      return;
    }

    setCustomSkills(next);
    await runPersist({ customSkills: next }, () => setCustomSkills(previous));
    void globalMutate("slashable-skills");
    setEditingSkill(null);
    setSeedSkill(null);
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
    void globalMutate("slashable-skills");
    void onSettingsChange?.();
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

  const allSkillsNav: Array<{
    id: SkillSection;
    label: string;
  }> = [
    { id: "oracle", label: "Oracle" },
    { id: "community", label: "Community" },
    { id: "connected", label: "Connected" },
    { id: "custom", label: "Custom" },
  ];
  const skillsNav = sections
    ? allSkillsNav.filter((item) => sections.includes(item.id))
    : allSkillsNav;

  const openCustomSkillEditor = () => {
    setEditingSkill(null);
    setSeedSkill(null);
    setEditorOpen(true);
  };

  const addCustomSkillButton = (
    <Button
      className="w-full shrink-0 sm:w-auto"
      onClick={openCustomSkillEditor}
      size="sm"
      type="button"
      variant="outline"
    >
      <Plus className="size-4" />
      Add a custom skill
    </Button>
  );

  const showsCustomSection =
    sections?.includes("custom") ||
    (!sections?.length && activeSection === "custom");

  if (editorOpen) {
    return (
      <CustomSkillEditor
        initialContent={editingSkill?.content ?? seedSkill?.content ?? ""}
        initialDescription={
          editingSkill?.description ?? seedSkill?.description ?? ""
        }
        initialFiles={editorFiles}
        initialName={editingSkill?.name ?? seedSkill?.name ?? ""}
        onCancel={() => {
          setEditorOpen(false);
          setEditingSkill(null);
          setSeedSkill(null);
          setEditorFiles([]);
        }}
        onSave={handleSaveCustomSkill}
        title={
          editingSkill
            ? "Edit custom skill"
            : seedSkill
              ? "Clone custom skill"
              : "New custom skill"
        }
      />
    );
  }

  const panelBody = (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-testid="skills-panel"
    >
      {!embeddedMode ? (
        <div className="flex items-start justify-between gap-3 border-border/60 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 font-medium text-sm">
              <Blocks className="size-3.5 text-muted-foreground" />
              Skills
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {orgManaged
                ? "Your organization provides these skills. You can disable them for your chats. Connected skills are invoked with / in chat."
                : "Changes apply to new messages. Click a skill to preview. Connected skills are invoked with / in chat."}
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
      ) : null}

      {skillsNav.length > 1 ? (
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
      ) : null}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5",
          embeddedMode && "px-0 sm:px-0",
        )}
      >
        {showSkeletons ? (
          <SkillsListSkeleton />
        ) : activeSection === "oracle" ? (
          <>
            {oracleCatalog.map((skill) => (
              <SkillRow
                author={skill.author}
                carriedBy={personasCarrying(
                  skill.id,
                  personaSkillIds,
                  data?.personas ?? [],
                )}
                description={skill.description}
                disabled={skill.alwaysOn}
                key={skill.id}
                mode={resolveSkillMode({
                  skillId: skill.id,
                  kind: "oracle",
                  alwaysOn: skill.alwaysOn,
                  skillModes,
                  enabledSkillIds,
                })}
                name={skill.name}
                onModeChange={(mode) =>
                  void handleSkillModeChange(skill.id, "oracle", mode)
                }
                pending={pendingToggles.has(skill.id)}
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
                carriedBy={personasCarrying(
                  skill.id,
                  personaSkillIds,
                  data?.personas ?? [],
                )}
                description={skill.description}
                key={skill.id}
                mode={resolveSkillMode({
                  skillId: skill.id,
                  kind: "community",
                  skillModes,
                  enabledSkillIds,
                })}
                name={skill.name}
                onModeChange={(mode) =>
                  void handleSkillModeChange(skill.id, "community", mode)
                }
                pending={pendingToggles.has(skill.id)}
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
            {embeddedMode && !embeddedHeader ? (
              <div className="mb-3">
                <Button
                  onClick={openCustomSkillEditor}
                  type="button"
                  variant="outline"
                >
                  <Plus className="mr-1.5 size-4" />
                  Add a custom skill
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              {customSkills.map((skill) => (
                <SkillRow
                  actions={
                    <>
                      <Button
                        aria-label={`Download ${skill.name}`}
                        className="size-7"
                        onClick={() => {
                          window.location.href = `/api/skills/${encodeURIComponent(skill.id)}/export`;
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Download className="size-3.5" />
                      </Button>
                      <Button
                        aria-label={`Clone ${skill.name}`}
                        className="size-7"
                        onClick={() => {
                          openCloneCustomSkill(skill);
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Files className="size-3.5" />
                      </Button>
                      {skill.managedByOrg ? null : (
                        <>
                          <Button
                            aria-label={`Edit ${skill.name}`}
                            className="size-7"
                            onClick={() => {
                              setSeedSkill(null);
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
                            onClick={() => {
                              const carriers = personasCarrying(
                                skill.id,
                                personaSkillIds,
                                data?.personas ?? [],
                              );
                              setPendingDestructive({
                                confirmLabel: "Delete",
                                description:
                                  carriers.length > 0
                                    ? `This permanently deletes the custom skill. ${carriers.map((persona) => persona.name).join(", ")} ${carriers.length === 1 ? "releases" : "release"} it and ${carriers.length === 1 ? "stays" : "stay"}.`
                                    : "This permanently deletes the custom skill.",
                                onConfirm: () =>
                                  handleDeleteCustomSkill(skill.id),
                                title: `Delete ${skill.name}?`,
                              });
                            }}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </>
                  }
                  author={customSkillAuthor(skill)}
                  files={skill.files}
                  skillId={skill.id}
                  carriedBy={personasCarrying(
                    skill.id,
                    personaSkillIds,
                    data?.personas ?? [],
                  )}
                  key={skill.id}
                  mode={resolveSkillMode({
                    skillId: skill.id,
                    kind: "custom",
                    skillModes,
                    enabledSkillIds,
                    customEnabled: skill.enabled !== false,
                  })}
                  name={skill.name}
                  onModeChange={(mode) =>
                    void handleSkillModeChange(skill.id, "custom", mode)
                  }
                  pending={pendingToggles.has(skill.id)}
                  preview={{ kind: "inline", content: skill.content }}
                  updatedAt={skill.updatedAt}
                  variant="card"
                />
              ))}
            </div>
            {customSkills.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No custom skills yet. Add one to tailor Ava for your workflows.
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-6">
            {!orgManaged ? (
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
                  Public repos only. Set a skill to Slash command (or Auto) then
                  type{" "}
                  <code className="rounded bg-muted px-1">/skill-name</code> in
                  chat.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Your organization provides these packs. Disable a pack to hide
                its skills from your chats. Invoke enabled skills with / in
                chat.
              </p>
            )}

            {connectedSources.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-sm">
                No connected skill packs yet.
              </div>
            ) : (
              connectedSources.map((source) => {
                const skillsForSource = connectedSkills.filter(
                  (skill) => skill.sourceId === source.id,
                );
                // source.skillCount is restated from disk by the API, so an
                // empty list here means empty, not unloaded.
                const skillCount = skillsForSource.length;
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
                      {orgManaged ? (
                        <Switch
                          aria-busy={pendingToggles.has(source.id)}
                          aria-label={`${source.userEnabled === false ? "Enable" : "Disable"} ${source.label}`}
                          checked={source.userEnabled !== false}
                          className={cn(
                            "shrink-0",
                            pendingToggles.has(source.id) && "opacity-60",
                          )}
                          onCheckedChange={(checked) => {
                            void handleConnectedPackToggle(source.id, checked);
                          }}
                        />
                      ) : null}
                      {!orgManaged ? (
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
                            onClick={() => {
                              setPendingDestructive({
                                confirmLabel: "Disconnect",
                                description:
                                  "This disconnects the pack. Skills from this source will no longer be available.",
                                onConfirm: () =>
                                  handleDisconnectSource(source.id),
                                title: `Disconnect ${source.label}?`,
                              });
                            }}
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
                      ) : null}
                    </div>
                    {expanded ? (
                      <div className="border-border/60 border-t px-3">
                        {source.userEnabled === false ? (
                          <p className="py-3 text-muted-foreground text-xs">
                            This pack is off for your chats. Turn it on above to
                            use these skills.
                          </p>
                        ) : (
                          <>
                            {skillsForSource.map((skill) => (
                              <SkillRow
                                author={source.label}
                                carriedBy={personasCarrying(
                                  skill.id,
                                  personaSkillIds,
                                  data?.personas ?? [],
                                )}
                                description={
                                  skill.slug
                                    ? `/${skill.slug} — ${skill.description}`
                                    : skill.description
                                }
                                key={skill.id}
                                mode={resolveSkillMode({
                                  skillId: skill.id,
                                  kind: "connected",
                                  skillModes,
                                  enabledSkillIds,
                                })}
                                name={skill.name}
                                onModeChange={(mode) =>
                                  void handleSkillModeChange(
                                    skill.id,
                                    "connected",
                                    mode,
                                  )
                                }
                                pending={pendingToggles.has(skill.id)}
                                preview={{
                                  kind: "remote",
                                  skillId: skill.id,
                                }}
                                updatedAt={skill.updatedAt}
                              />
                            ))}
                            {skillsForSource.length === 0 ? (
                              <p className="py-3 text-muted-foreground text-xs">
                                {orgManaged
                                  ? source.lastError
                                    ? `Skills could not be loaded: ${source.lastError}`
                                    : "No skills are cached for this pack yet. Ask your administrator to refresh it in Admin → Skills."
                                  : "No SKILL.md files cached. Try Refresh."}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {!embeddedMode && portal ? (
        <DialogFooter
          className={cn(
            "flex-row items-center justify-between gap-2 border-t border-border/60 px-4 py-3 sm:justify-between sm:px-5",
          )}
        >
          {activeSection === "custom" ? (
            <Button
              onClick={openCustomSkillEditor}
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
          <Button onClick={() => portal.closePortal()} type="button">
            Done
          </Button>
        </DialogFooter>
      ) : null}
      <ConfirmDestructiveDialog
        confirmLabel={pendingDestructive?.confirmLabel}
        description={
          pendingDestructive?.description ?? "This action cannot be undone."
        }
        onConfirm={() => pendingDestructive?.onConfirm()}
        variant={pendingDestructive?.variant}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDestructive(null);
          }
        }}
        open={pendingDestructive !== null}
        title={pendingDestructive?.title ?? "Confirm"}
      />
    </div>
  );

  if (embeddedHeader) {
    return (
      <div className="space-y-6">
        <OnboardingStepProse
          action={showsCustomSection ? addCustomSkillButton : undefined}
          description={embeddedHeader.description}
          title={embeddedHeader.title}
        />
        {panelBody}
      </div>
    );
  }

  return panelBody;
}
