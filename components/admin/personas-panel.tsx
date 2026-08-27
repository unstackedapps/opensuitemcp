"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { adminSetOrgPersonaEnabled } from "@/app/admin/personas/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
  ADMIN_SKILL_LIST_SCROLL_CLASS,
  AdminPanel,
} from "@/components/admin/admin-shell";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminOrgPersonaRow } from "@/lib/org/admin/personas";
import { cn } from "@/lib/utils";

type PersonasPanelProps = {
  personas: AdminOrgPersonaRow[];
};

export function PersonasPanel({ personas }: PersonasPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return personas;
    }
    return personas.filter(
      (persona) =>
        persona.name.toLowerCase().includes(q) ||
        persona.shortName.toLowerCase().includes(q) ||
        persona.primaryRole.toLowerCase().includes(q) ||
        persona.personaRef.toLowerCase().includes(q),
    );
  }, [personas, query]);

  const notify = (result: { ok: boolean; error?: string }, success: string) => {
    if (result.ok) {
      toast({ type: "success", description: success });
      router.refresh();
      return;
    }
    toast({
      type: "error",
      description: result.error ?? "Request failed.",
    });
  };

  const run = async (
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) => {
    setPendingId(id);
    const result = await action();
    setPendingId(null);
    notify(result, success);
  };

  return (
    <AdminPanel
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      fillViewport
      title="Personas"
    >
      <Input
        className={cn(ADMIN_SELECT_TRIGGER_CLASS, "max-w-md shrink-0")}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search personas…"
        value={query}
      />

      <ul className={ADMIN_SKILL_LIST_SCROLL_CLASS}>
        {filtered.map((persona) => {
          const busy = pendingId === persona.id;
          return (
            <li
              className="flex flex-col gap-2 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center"
              key={persona.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{persona.name}</p>
                <p className="line-clamp-2 text-muted-foreground text-xs">
                  {persona.primaryRole || persona.personaRef}
                </p>
                {persona.alwaysOn ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Always on
                  </p>
                ) : null}
              </div>
              <Button
                className={ADMIN_CONTROL_CLASS}
                disabled={busy || persona.alwaysOn}
                onClick={() =>
                  run(
                    persona.id,
                    () =>
                      adminSetOrgPersonaEnabled({
                        personaId: persona.id,
                        enabled: !persona.enabled,
                      }),
                    persona.enabled ? "Persona disabled." : "Persona enabled.",
                  )
                }
                type="button"
                variant="outline"
              >
                {persona.enabled ? "Disable" : "Enable"}
              </Button>
            </li>
          );
        })}
      </ul>
    </AdminPanel>
  );
}
