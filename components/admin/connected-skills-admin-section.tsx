"use client";

import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  adminConnectOrgConnectedSkillSource,
  adminDisconnectOrgConnectedSkillSource,
  adminRefreshOrgConnectedSkillSource,
  adminSetOrgConnectedSkillSourceEnabled,
} from "@/app/admin/skills/actions";
import {
  ADMIN_CONTROL_CLASS,
  ADMIN_SELECT_TRIGGER_CLASS,
  ADMIN_SKILL_LIST_SCROLL_CLASS,
  AdminDeleteButton,
} from "@/components/admin/admin-shell";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrgConnectedSkillSourceRow } from "@/lib/org/connected-skills";
import { cn } from "@/lib/utils";

type ConnectedSkillsAdminSectionProps = {
  connectedSources: OrgConnectedSkillSourceRow[];
  compact?: boolean;
  onAfterChange?: () => void | Promise<void>;
};

export function ConnectedSkillsAdminSection({
  connectedSources,
  compact = false,
  onAfterChange,
}: ConnectedSkillsAdminSectionProps) {
  const router = useRouter();
  const connectUrlId = useId();
  const [connectUrl, setConnectUrl] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const notify = async (
    result: { ok: boolean; error?: string },
    success: string,
  ) => {
    if (result.ok) {
      toast({ type: "success", description: success });
      router.refresh();
      await onAfterChange?.();
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
    await notify(result, success);
  };

  return (
    <div
      className={cn(
        compact
          ? "space-y-3"
          : "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden",
      )}
    >
      <div className="shrink-0 space-y-2">
        <Label className="text-xs" htmlFor={connectUrlId}>
          GitHub skills URL
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className={ADMIN_SELECT_TRIGGER_CLASS}
            id={connectUrlId}
            onChange={(event) => setConnectUrl(event.target.value)}
            placeholder="https://github.com/owner/repo/tree/main/skills/…"
            value={connectUrl}
          />
          <Button
            className={ADMIN_CONTROL_CLASS}
            disabled={isConnecting || !connectUrl.trim()}
            onClick={async () => {
              setIsConnecting(true);
              const result = await adminConnectOrgConnectedSkillSource({
                url: connectUrl.trim(),
              });
              setIsConnecting(false);
              if (result.ok) {
                toast({
                  type: "success",
                  description: "Connected skill pack added.",
                });
                setConnectUrl("");
                router.refresh();
                await onAfterChange?.();
                return;
              }
              toast({
                type: "error",
                description: result.error ?? "Connect failed.",
              });
            }}
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
        <p className="text-muted-foreground text-xs">Public repos only.</p>
      </div>

      <ul
        className={cn(
          "flex flex-col gap-2",
          compact ? "max-h-none" : ADMIN_SKILL_LIST_SCROLL_CLASS,
        )}
      >
        {connectedSources.map((source) => {
          const busy = pendingId === source.id;
          return (
            <li
              className="flex flex-col gap-2 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center"
              key={source.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{source.label}</p>
                <p className="text-muted-foreground text-xs">
                  {source.skillCount} skill
                  {source.skillCount === 1 ? "" : "s"}
                  {source.lastError ? ` · ${source.lastError}` : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className={cn(ADMIN_CONTROL_CLASS, "px-2")}
                  disabled={busy}
                  onClick={() =>
                    run(
                      source.id,
                      () =>
                        adminRefreshOrgConnectedSkillSource({
                          sourceId: source.id,
                        }),
                      "Pack refreshed.",
                    )
                  }
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="size-3.5" />
                </Button>
                <Button
                  className={ADMIN_CONTROL_CLASS}
                  disabled={busy}
                  onClick={() =>
                    run(
                      source.id,
                      () =>
                        adminSetOrgConnectedSkillSourceEnabled({
                          sourceId: source.id,
                          enabled: !source.enabled,
                        }),
                      source.enabled ? "Pack disabled." : "Pack enabled.",
                    )
                  }
                  type="button"
                  variant="outline"
                >
                  {source.enabled ? "Disable" : "Enable"}
                </Button>
                <AdminDeleteButton
                  confirmLabel="Disconnect"
                  description="This disconnects the pack. Skills from this source will no longer be available."
                  disabled={busy}
                  label="Disconnect pack"
                  onConfirm={() =>
                    run(
                      source.id,
                      () =>
                        adminDisconnectOrgConnectedSkillSource({
                          sourceId: source.id,
                        }),
                      "Pack disconnected.",
                    )
                  }
                  title={`Disconnect ${source.label}?`}
                />
              </div>
            </li>
          );
        })}
        {connectedSources.length === 0 ? (
          <li className="flex flex-col gap-2 rounded-md border border-dashed border-border/60 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-muted-foreground text-sm">
                No connected packs yet
              </p>
              <p className="text-muted-foreground text-xs">
                Connect a public GitHub skills repo to sync packs for your org.
              </p>
            </div>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
