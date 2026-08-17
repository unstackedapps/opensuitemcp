"use client";

import { Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";
import { PersonaDetailsLink } from "@/components/persona-details-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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

export function PersonasPanel({ active }: PersonasPanelProps) {
  const { data: session } = useSession();
  const isGuest = guestRegex.test(session?.user?.email ?? "");
  const { data, error, isLoading, mutate } = useSWR(
    active ? "/api/settings?personas=1" : null,
    fetchSettingsPersonas,
  );

  const [hidePicker, setHidePicker] = useState(false);
  const [defaultId, setDefaultId] = useState(AVA_PERSONA_ID);
  const [customPersonas, setCustomPersonas] = useState<CustomPersona[]>([]);
  const [editing, setEditing] = useState<CustomPersona | null>(null);
  const [editName, setEditName] = useState("");
  const [editShortName, setEditShortName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [startingInterview, setStartingInterview] = useState(false);

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
    [mutate],
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

  if (!active) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
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
      className="flex h-full flex-col gap-4 overflow-y-auto p-4"
      data-testid="personas-panel"
    >
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-lg">
          <UserRound className="size-5" />
          Personas
        </h2>
        <p className="text-muted-foreground text-sm">
          Specialists shape how the assistant approaches NetSuite work. Each
          chat uses one persona. Click a card to set your default.
        </p>
        {isGuest ? (
          <p className="mt-1 text-muted-foreground text-xs">
            As a guest, defaults are limited to built-in personas and stored in
            this browser.
          </p>
        ) : null}
      </div>

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

      <Tabs defaultValue="builtin">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="builtin">Built-In</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-3" value="builtin">
          <div
            aria-label="Built-in personas"
            className="grid gap-2 sm:grid-cols-2"
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

        <TabsContent className="mt-3 space-y-3" value="custom">
          {!isGuest ? (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                disabled={
                  saving || startingInterview || customPersonas.length >= 32
                }
                onClick={() => {
                  void startInterview();
                }}
                size="sm"
                type="button"
                variant="default"
              >
                {startingInterview ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Create with interview
              </Button>
              <Button
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
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          ) : null}

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
              className="grid gap-2 sm:grid-cols-2"
              role="listbox"
            >
              {customListPersonas.map((persona) => {
                const custom = customPersonas.find((p) => p.id === persona.id);
                return (
                  <PersonaCard
                    actions={
                      custom ? (
                        <>
                          {!isGuest ? (
                            <Button
                              aria-label={`Refine ${persona.name} with interview`}
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
                            onClick={() => {
                              const previous = customPersonas;
                              const next = customPersonas.filter(
                                (p) => p.id !== persona.id,
                              );
                              setCustomPersonas(next);
                              void runPersist({ customPersonas: next }, () => {
                                setCustomPersonas(previous);
                              });
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

          {editing ? (
            <div className="space-y-3 rounded-lg border p-3">
              <h3 className="font-medium text-sm">
                {customPersonas.some((p) => p.id === editing.id)
                  ? "Edit persona"
                  : "New persona"}
              </h3>
              <div className="space-y-1.5">
                <Label htmlFor="persona-name">Name</Label>
                <Input
                  id="persona-name"
                  maxLength={200}
                  onChange={(event) => {
                    setEditName(event.target.value);
                  }}
                  value={editName}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="persona-short-name">Short name</Label>
                <Input
                  id="persona-short-name"
                  maxLength={40}
                  onChange={(event) => {
                    setEditShortName(event.target.value);
                  }}
                  placeholder="Shown in sidebar / badge"
                  value={editShortName}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="persona-content">Instructions</Label>
                <Textarea
                  className="min-h-40 font-mono text-xs"
                  id="persona-content"
                  maxLength={32_000}
                  onChange={(event) => {
                    setEditContent(event.target.value);
                  }}
                  value={editContent}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setEditing(null);
                  }}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  disabled={saving || !editName.trim() || !editContent.trim()}
                  onClick={() => {
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
                    const exists = customPersonas.some(
                      (p) => p.id === editing.id,
                    );
                    const next = exists
                      ? customPersonas.map((p) =>
                          p.id === editing.id ? nextEntry : p,
                        )
                      : [...customPersonas, nextEntry];
                    setCustomPersonas(next);
                    setEditing(null);
                    void runPersist({ customPersonas: next }, () => {
                      setCustomPersonas(previous);
                    });
                  }}
                  type="button"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
