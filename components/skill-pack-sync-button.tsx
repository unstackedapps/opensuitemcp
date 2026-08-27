"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { skillsPackSyncEnabled } from "@/lib/product-features";
import { cn } from "@/lib/utils";

export type SkillPackId = "oracle" | "community";

const PACK_LABELS: Record<SkillPackId, string> = {
  oracle: "Oracle",
  community: "Community",
};

async function syncSkillPack(pack: SkillPackId): Promise<void> {
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
        : "Failed to refresh skills",
    );
  }
}

type SkillPackSyncButtonProps = {
  className?: string;
  label?: string;
  onSynced?: () => void | Promise<void>;
  pack: SkillPackId | "all";
  variant?: "default" | "outline" | "ghost";
};

export function SkillPackSyncButton({
  className,
  label = "Resync all",
  onSynced,
  pack,
  variant = "outline",
}: SkillPackSyncButtonProps) {
  const [busy, setBusy] = useState(false);

  if (!skillsPackSyncEnabled) {
    return null;
  }

  const syncOne = async (target: SkillPackId) => {
    try {
      await syncSkillPack(target);
      return null;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to refresh skills";
      return `${PACK_LABELS[target]}: ${message}`;
    }
  };

  const handleClick = async () => {
    setBusy(true);
    try {
      if (pack === "all") {
        const oracleError = await syncOne("oracle");
        const communityError = await syncOne("community");
        const failures = [oracleError, communityError].filter(
          (message): message is string => message !== null,
        );

        await onSynced?.();

        if (failures.length === 0) {
          toast({
            type: "success",
            description: "Oracle and Community skill packs refreshed.",
          });
          return;
        }

        toast({
          type: "error",
          description: failures.join(" "),
        });
        return;
      }

      const failure = await syncOne(pack);
      await onSynced?.();

      if (failure) {
        toast({ type: "error", description: failure });
        return;
      }

      toast({
        type: "success",
        description: `${PACK_LABELS[pack]} skills refreshed.`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      className={cn("h-8 text-xs sm:text-sm", className)}
      disabled={busy}
      onClick={() => void handleClick()}
      type="button"
      variant={variant}
    >
      {busy ? (
        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-1.5 size-3.5" />
      )}
      {label}
    </Button>
  );
}
