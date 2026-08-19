"use client";

import { Loader2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { PersonaDetailsLink } from "@/components/persona-details-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AVA_PERSONA_ID } from "@/lib/ai/personas/ids";
import { cn } from "@/lib/utils";

export type PersonaListItem = {
  id: string;
  name: string;
  shortName: string;
  primaryRole: string;
  source: "ava" | "builtin" | "custom";
};

type PersonaPickerDialogProps = {
  open: boolean;
  personas: PersonaListItem[];
  /** Show “Create my own…” (registered users). */
  showCreateOwn?: boolean;
  /** When true, Escape / outside click closes without choosing. */
  dismissible?: boolean;
  /** True while a Create my own interview chat is being set up. */
  startingInterview?: boolean;
  onSelect: (personaId: string, doNotShowAgain: boolean) => void;
  onDismiss?: () => void;
};

function PersonaOptionButton({
  persona,
  disabled = false,
  onSelect,
  onDetailsOpenChange,
}: {
  persona: PersonaListItem;
  disabled?: boolean;
  onSelect: () => void;
  onDetailsOpenChange?: (open: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border p-3 transition-colors",
        disabled
          ? "pointer-events-none opacity-60"
          : "hover:border-primary hover:bg-primary/5",
      )}
    >
      <button
        aria-label={`${persona.name}: ${persona.primaryRole}`}
        className={cn(
          "flex min-h-0 flex-1 flex-col items-start gap-1 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        data-testid={`persona-option-${persona.id}`}
        disabled={disabled}
        onClick={onSelect}
        role="option"
        type="button"
      >
        <span className="font-medium text-sm">{persona.name}</span>
        <span className="text-muted-foreground text-xs">
          {persona.shortName}
          {persona.id === AVA_PERSONA_ID ? " · default" : ""}
        </span>
        <span className="text-muted-foreground text-xs leading-snug">
          {persona.primaryRole}
        </span>
      </button>

      <div className="mt-auto border-t pt-2">
        <PersonaDetailsLink
          onOpenChange={onDetailsOpenChange}
          persona={persona}
          testId={`persona-details-${persona.id}`}
        />
      </div>
    </div>
  );
}

export function PersonaPickerDialog({
  open,
  personas,
  showCreateOwn = false,
  dismissible = false,
  startingInterview = false,
  onSelect,
  onDismiss,
}: PersonaPickerDialogProps) {
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const checkboxId = useId();

  const { builtinPersonas, customPersonas } = useMemo(() => {
    const builtin: PersonaListItem[] = [];
    const custom: PersonaListItem[] = [];
    for (const persona of personas) {
      if (persona.source === "custom") {
        custom.push(persona);
      } else {
        builtin.push(persona);
      }
    }
    return { builtinPersonas: builtin, customPersonas: custom };
  }, [personas]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (startingInterview) {
          return;
        }
        if (!nextOpen && dismissible && !detailsOpen) {
          onDismiss?.();
        }
      }}
    >
      <DialogContent
        className="flex h-[min(85vh,36rem)] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-4 overflow-hidden sm:max-w-2xl"
        data-testid="persona-picker"
        showCloseButton={dismissible && !startingInterview}
        aria-busy={startingInterview}
        onEscapeKeyDown={(event) => {
          if (!dismissible || detailsOpen || startingInterview) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (!dismissible || detailsOpen || startingInterview) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {dismissible ? "Change persona" : "Choose a persona"}
          </DialogTitle>
          <DialogDescription>
            {dismissible
              ? "Pick a different specialist for this chat. You can change your default later in Settings."
              : "This chat will use the specialist you pick. You can change your default later in Settings."}
          </DialogDescription>
        </DialogHeader>

        <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="builtin">
          <TabsList className="grid w-full shrink-0 grid-cols-2">
            <TabsTrigger value="builtin">Built-In</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          <TabsContent
            className="mt-2 min-h-0 flex-1 overflow-y-auto"
            value="builtin"
          >
            <div
              aria-label="Built-in personas"
              className="grid gap-2 sm:grid-cols-2"
              role="listbox"
            >
              {builtinPersonas.map((persona) => (
                <PersonaOptionButton
                  disabled={startingInterview}
                  key={persona.id}
                  onDetailsOpenChange={setDetailsOpen}
                  onSelect={() => {
                    onSelect(persona.id, doNotShowAgain);
                  }}
                  persona={persona}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent
            className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto"
            value="custom"
          >
            {customPersonas.length > 0 ? (
              <div
                aria-label="Custom personas"
                className="grid gap-2 sm:grid-cols-2"
                role="listbox"
              >
                {customPersonas.map((persona) => (
                  <PersonaOptionButton
                    disabled={startingInterview}
                    key={persona.id}
                    onDetailsOpenChange={setDetailsOpen}
                    onSelect={() => {
                      onSelect(persona.id, doNotShowAgain);
                    }}
                    persona={persona}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No custom personas yet.
              </p>
            )}

            {showCreateOwn ? (
              <button
                aria-busy={startingInterview}
                aria-label="Create my own persona with an interview"
                className={cn(
                  "flex w-full flex-col items-start gap-1 rounded-lg border border-dashed p-3 text-left transition-colors",
                  startingInterview
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary hover:bg-primary/5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-wait",
                )}
                data-testid="persona-create-own"
                disabled={startingInterview}
                onClick={() => {
                  onSelect("persona-builder", false);
                }}
                type="button"
              >
                {startingInterview ? (
                  <>
                    <span className="flex items-center gap-2 font-medium text-sm">
                      <Loader2 className="size-3.5 animate-spin" />
                      Starting interview…
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Setting up a new chat
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-sm">Create my own…</span>
                    <span className="text-muted-foreground text-xs">
                      Interview · Guided questions to draft a custom persona
                    </span>
                  </>
                )}
              </button>
            ) : null}
          </TabsContent>
        </Tabs>

        <div className="shrink-0 space-y-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <input
              checked={doNotShowAgain}
              className="size-4 rounded border"
              data-testid="persona-do-not-show-again"
              id={checkboxId}
              onChange={(event) => {
                setDoNotShowAgain(event.target.checked);
              }}
              type="checkbox"
            />
            <Label
              className="cursor-pointer font-normal text-sm"
              htmlFor={checkboxId}
            >
              Do not show again
            </Label>
          </div>
          <p className="text-muted-foreground text-xs">
            {dismissible
              ? "Personas can be changed at anytime in Settings > Personas."
              : "Select a persona to continue. Sending is disabled until you choose. Personas can be changed at anytime in Settings > Personas."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
