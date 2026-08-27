"use client";

import { Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { OnboardingPanelSkeleton } from "@/components/onboarding/onboarding-panel-skeleton";
import { PersonaDetailsLink } from "@/components/persona-details-dialog";
import { useOptionalAppPortal } from "@/components/portal/context";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";
import { guestRegex } from "@/lib/constants";
import { cn, generateUUID } from "@/lib/utils";
import { toast } from "./toast";

type PersonaListItem = {
  id: string;
  name: string;
  shortName: string;
  primaryRole: string;
  source: "ava" | "builtin" | "custom";
};

type CustomPersona = {
  id: string;
  name: string;
  shortName: string;
  primaryRole?: string;
  content: string;
  updatedAt: string;
};

type SettingsPersonasPayload = {
  defaultPersonaId: string | null;
  hidePersonaPicker: boolean;
  customPersonas: CustomPersona[];
  personas: PersonaListItem[];
};

type PersonasPanelProps = {
  active: boolean;
  embedded?: boolean;
  onSettingsChange?: () => void | Promise<void>;
};

async function fetchSettingsPersonas(): Promise<SettingsPersonasPayload> {
  const response = await fetch("/api/settings");
  if (!response.ok) {
    throw new Error("Failed to load settings");
  }
  const data = await response.json();
  return {
    defaultPersonaId: data.defaultPersonaId ?? null,
    hidePersonaPicker: Boolean(data.hidePersonaPicker),
    customPersonas: Array.isArray(data.customPersonas)
      ? data.customPersonas
      : [],
    personas: Array.isArray(data.personas) ? data.personas : [],
  };
}

async function persistPersonaSettings(
  payload: Partial<{
    defaultPersonaId: string | null;
    hidePersonaPicker: boolean;
    customPersonas: CustomPersona[];
  }>,
) {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      typeof error.error === "string"
        ? error.error
        : "Failed to save persona settings",
    );
  }
}

function PersonaCard({
  persona,
  selected,
  disabled,
  onSelect,
  actions,
  inlineContent,
}: {
  persona: PersonaListItem;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  actions?: ReactNode;
  /** When set (custom personas), skip the fetch. */
  inlineContent?: string | null;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border p-3 transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "hover:border-primary/60 hover:bg-primary/5",
      )}
    >
      <button
        aria-label={`Set ${persona.name} as default persona`}
        aria-pressed={selected}
        className={cn(
          "flex min-h-0 flex-1 flex-col items-start gap-1 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled && "pointer-events-none opacity-60",
        )}
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        <span className="font-medium text-sm">{persona.name}</span>
        <span className="text-muted-foreground text-xs">
          {persona.shortName}
          {selected ? " · default" : ""}
        </span>
        <span className="text-muted-foreground text-xs leading-snug">
          {persona.primaryRole}
        </span>
      </button>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-1 border-t pt-2">
        <PersonaDetailsLink inlineContent={inlineContent} persona={persona} />
        {actions ? (
          <div className="flex flex-wrap items-center gap-1">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

export function PersonasPanel({
  active,
  embedded = false,
  onSettingsChange,
}: PersonasPanelProps) {
  const portal = useOptionalAppPortal();
  const { data: session } = useSession();
  const isGuest = guestRegex.test(session?.user?.email ?? "");
  const { data, error, isLoading, mutate } = useSWR(
    active ? "/api/settings?personas=1" : null,
    fetchSettingsPersonas,
  );

  const [tab, setTab] = useState("builtin");

  const [hidePicker, setHidePicker] = useState(false);
  const [defaultId, setDefaultId] = useState(AVA_PERSONA_ID);
  const [customPersonas, setCustomPersonas] = useState<CustomPersona[]>([]);
  const [editing, setEditing] = useState<CustomPersona | null>(null);
  const [editName, setEditName] = useState("");
  const [editShortName, setEditShortName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [startingInterview, setStartingInterview] = useState(false);
  const [pendingDeletePersona, setPendingDeletePersona] =
    useState<CustomPersona | null>(null);

  useEffect(() => {
    if (!data) {
      return;
    }
    setHidePicker(data.hidePersonaPicker);
    setDefaultId(data.defaultPersonaId ?? AVA_PERSONA_ID);
    setCustomPersonas(data.customPersonas);
  }, [data]);

  const runPersist = useCallback(
    async (
      payload: Partial<{
        defaultPersonaId: string | null;
        hidePersonaPicker: boolean;
        customPersonas: CustomPersona[];
      }>,
      rollback: () => void,
    ) => {
      setSaving(true);
      try {
        await persistPersonaSettings(payload);
        await mutate();
        await onSettingsChange?.();
        toast({ type: "success", description: "Persona settings saved" });
      } catch (err) {
        rollback();
        toast({
          type: "error",
          description:
            err instanceof Error ? err.message : "Failed to save settings",
        });
      } finally {
        setSaving(false);
      }
    },
    [mutate, onSettingsChange],
  );

  const setDefaultPersona = useCallback(
    (personaId: string) => {
      const previous = defaultId;
      setDefaultId(personaId);
      void runPersist(
        {
          defaultPersonaId: personaId === AVA_PERSONA_ID ? null : personaId,
        },
        () => {
          setDefaultId(previous);
        },
      );
    },
    [defaultId, runPersist],
  );

  const startInterview = useCallback(async (refiningPersonaId?: string) => {
    setStartingInterview(true);
    try {
      const response = await fetch("/api/chat/persona-builder/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refiningPersonaId ? { refiningPersonaId } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : refiningPersonaId
              ? "Failed to start refine interview"
              : "Failed to start interview",
        );
      }
      window.location.href = `/chat/${payload.id}`;
    } catch (err) {
      toast({
        type: "error",
        description:
          err instanceof Error ? err.message : "Failed to start interview",
      });
      setStartingInterview(false);
    }
  }, []);

  const { builtinPersonas, customListPersonas } = useMemo(() => {
    const personas = data?.personas ?? [];
    const builtin: PersonaListItem[] = [];
    const custom: PersonaListItem[] = [];
    for (const persona of personas) {
      if (persona.source === "custom") {
        if (!isGuest) {
          custom.push(persona);
        }
      } else {
        builtin.push(persona);
      }
    }
    return { builtinPersonas: builtin, customListPersonas: custom };
  }, [data?.personas, isGuest]);

  const personaGridClass = cn(
    "grid gap-2 sm:grid-cols-2",
    embedded && "lg:grid-cols-3",
  );

  if (!active) {
    return null;
  }

  if (isLoading && !data) {
    return (
      <OnboardingPanelSkeleton
        className={embedded ? undefined : "p-4"}
        headerClassName="h-8 w-48"
        rowClassName="h-20 w-full"
        rows={2}
      />
    );
  }

  if (error) {
    return (
      <div className="p-4 text-destructive text-sm">
        Failed to load personas. Try again.
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
      data-testid="personas-panel"
    >
      <div className="flex shrink-0 flex-col gap-3 border-border/60 border-b px-4 py-3 sm:px-5">
        {!embedded ? (
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 font-medium text-sm">
              <UserRound className="size-3.5 text-muted-foreground" />
              Personas
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Specialists shape how the assistant approaches NetSuite work. Each
              chat uses one persona. Click a card to set your default.
            </p>
            {isGuest ? (
              <p className="text-muted-foreground text-xs">
                As a guest, defaults are limited to built-in personas and stored
                in this browser.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <Label
            className="cursor-pointer font-normal text-sm"
            htmlFor="show-persona-picker"
          >
            Show persona picker on new chats
          </Label>
          <Switch
            checked={!hidePicker}
            disabled={saving}
            id="show-persona-picker"
            onCheckedChange={(show) => {
              const previous = hidePicker;
              const nextHide = !show;
              setHidePicker(nextHide);
              const payload: {
                hidePersonaPicker: boolean;
                defaultPersonaId?: string | null;
              } = { hidePersonaPicker: nextHide };
              if (nextHide) {
                payload.defaultPersonaId =
                  defaultId === AVA_PERSONA_ID ? null : defaultId;
              }
              void runPersist(payload, () => {
                setHidePicker(previous);
              });
            }}
          />
        </div>
      </div>

      {embedded ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <div
            aria-label="Built-in personas"
            className={personaGridClass}
            role="listbox"
          >
            {builtinPersonas.map((persona) => (
              <PersonaCard
                disabled={saving}
                key={persona.id}
                onSelect={() => {
                  setDefaultPersona(persona.id);
                }}
                persona={persona}
                selected={defaultId === persona.id}
              />
            ))}
          </div>
        </div>
      ) : (
        <Tabs
          className="flex min-h-0 flex-1 flex-col"
          onValueChange={setTab}
          value={tab}
        >
          <div className="shrink-0 border-border/60 border-b px-4 py-3 sm:px-5">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="builtin">Built-In</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
            <TabsContent className="mt-0" value="builtin">
              <div
                aria-label="Built-in personas"
                className={personaGridClass}
                role="listbox"
              >
                {builtinPersonas.map((persona) => (
                  <PersonaCard
                    disabled={saving}
                    key={persona.id}
                    onSelect={() => {
                      setDefaultPersona(persona.id);
                    }}
                    persona={persona}
                    selected={defaultId === persona.id}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent className="mt-0 space-y-3" value="custom">
              {!isGuest && customPersonas.length >= 32 ? (
                <p className="text-muted-foreground text-xs">
                  Limit reached — delete or refine an existing persona.
                </p>
              ) : null}

              {customListPersonas.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {isGuest
                    ? "Sign in to create and use custom personas."
                    : "No custom personas yet."}
                </p>
              ) : (
                <div
                  aria-label="Custom personas"
                  className={personaGridClass}
                  role="listbox"
                >
                  {customListPersonas.map((persona) => {
                    const custom = customPersonas.find(
                      (p) => p.id === persona.id,
                    );
                    return (
                      <PersonaCard
                        actions={
                          custom ? (
                            <>
                              {!isGuest ? (
                                <Button
                                  aria-label={`Refine ${persona.name} with interview`}
                                  className="hover:bg-foreground/10 dark:hover:bg-foreground/15"
                                  disabled={startingInterview}
                                  onClick={() => {
                                    void startInterview(persona.id);
                                  }}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  Refine
                                </Button>
                              ) : null}
                              <Button
                                aria-label={`Edit ${persona.name}`}
                                className="hover:bg-foreground/10 dark:hover:bg-foreground/15"
                                onClick={() => {
                                  setEditing(custom);
                                  setEditName(custom.name);
                                  setEditShortName(custom.shortName ?? "");
                                  setEditContent(custom.content);
                                }}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                aria-label={`Delete ${persona.name}`}
                                className="text-muted-foreground hover:bg-red-500/10 hover:text-red-500 dark:hover:bg-red-500/20 dark:hover:text-red-400"
                                onClick={() => {
                                  setPendingDeletePersona(custom);
                                }}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          ) : null
                        }
                        disabled={saving}
                        inlineContent={custom?.content ?? null}
                        key={persona.id}
                        onSelect={() => {
                          setDefaultPersona(persona.id);
                        }}
                        persona={persona}
                        selected={defaultId === persona.id}
                      />
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      )}
      <PersonaEditorDialog
        editing={editing}
        name={editName}
        onCancel={() => {
          setEditing(null);
        }}
        onNameChange={setEditName}
        onSave={() => {
          if (!editing) {
            return;
          }
          const previous = customPersonas;
          const nextEntry: CustomPersona = {
            id: editing.id,
            name: editName.trim(),
            shortName:
              editShortName.trim() ||
              editName.trim().split(/\s+/).at(0) ||
              editName.trim(),
            content: editContent.trim(),
            updatedAt: new Date().toISOString(),
          };
          const exists = customPersonas.some((p) => p.id === editing.id);
          const next = exists
            ? customPersonas.map((p) => (p.id === editing.id ? nextEntry : p))
            : [...customPersonas, nextEntry];
          setCustomPersonas(next);
          setEditing(null);
          void runPersist({ customPersonas: next }, () => {
            setCustomPersonas(previous);
          });
        }}
        onShortNameChange={setEditShortName}
        saving={saving}
        shortName={editShortName}
        content={editContent}
        onContentChange={setEditContent}
        isNew={
          editing ? !customPersonas.some((p) => p.id === editing.id) : true
        }
      />
      <ConfirmDestructiveDialog
        description="This permanently deletes the custom persona."
        onConfirm={() => {
          if (!pendingDeletePersona) {
            return;
          }
          const previous = customPersonas;
          const next = customPersonas.filter(
            (persona) => persona.id !== pendingDeletePersona.id,
          );
          setCustomPersonas(next);
          void runPersist({ customPersonas: next }, () => {
            setCustomPersonas(previous);
          });
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeletePersona(null);
          }
        }}
        open={pendingDeletePersona !== null}
        title={
          pendingDeletePersona
            ? `Delete ${pendingDeletePersona.name}?`
            : "Delete persona?"
        }
      />
      {!embedded && portal ? (
        <DialogFooter className="flex-col gap-2 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          {tab === "custom" && !isGuest ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <Button
                className="min-w-0"
                disabled={
                  saving || startingInterview || customPersonas.length >= 32
                }
                onClick={() => {
                  void startInterview();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {startingInterview ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    <span className="truncate">Starting interview…</span>
                  </>
                ) : (
                  <span className="truncate">Create with interview</span>
                )}
              </Button>
              <Button
                className="min-w-0"
                disabled={saving || customPersonas.length >= 32}
                onClick={() => {
                  setEditing({
                    id: generateUUID(),
                    name: "",
                    shortName: "",
                    content: "",
                    updatedAt: new Date().toISOString(),
                  });
                  setEditName("");
                  setEditShortName("");
                  setEditContent("");
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="mr-1.5 size-4" />
                Add
              </Button>
            </div>
          ) : (
            <span className="hidden sm:block" />
          )}
          <Button
            className="w-full sm:w-auto"
            onClick={() => portal.closePortal()}
            type="button"
          >
            Done
          </Button>
        </DialogFooter>
      ) : null}
    </div>
  );
}

type PersonaEditorDialogProps = {
  editing: CustomPersona | null;
  isNew: boolean;
  name: string;
  shortName: string;
  content: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onShortNameChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

function PersonaEditorDialog({
  editing,
  isNew,
  name,
  shortName,
  content,
  saving,
  onNameChange,
  onShortNameChange,
  onContentChange,
  onCancel,
  onSave,
}: PersonaEditorDialogProps) {
  const nameId = useId();
  const shortNameId = useId();
  const contentId = useId();

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open={editing !== null}
    >
      <DialogContent className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(90vh,800px)] sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-border/60 border-b px-4 py-3 text-left sm:px-5">
          <DialogTitle className="text-base">
            {isNew ? "New persona" : "Edit persona"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Name and instructions are required. Short name is shown in the
            sidebar and chat badge.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              maxLength={200}
              onChange={(event) => {
                onNameChange(event.target.value);
              }}
              value={name}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={shortNameId}>Short name</Label>
            <Input
              id={shortNameId}
              maxLength={40}
              onChange={(event) => {
                onShortNameChange(event.target.value);
              }}
              placeholder="Shown in sidebar / badge"
              value={shortName}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col space-y-1.5">
            <Label htmlFor={contentId}>Instructions</Label>
            <Textarea
              className="min-h-64 flex-1 resize-y font-mono text-xs md:min-h-80"
              id={contentId}
              maxLength={32_000}
              onChange={(event) => {
                onContentChange(event.target.value);
              }}
              rows={14}
              value={content}
            />
          </div>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-border/60 border-t px-4 py-3 sm:justify-end sm:px-5">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={saving || !name.trim() || !content.trim()}
            onClick={onSave}
            type="button"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
