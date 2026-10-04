"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "@/components/toast";

/**
 * Keep a result after the chat moves on.
 *
 * Shared by the fence toolbar and the canvas pane so one Save means one thing:
 * the same path rule, the same errors, the same tick afterwards.
 */
export function useSaveArtifact() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (artifact: { content: string; title: string; path?: string }) => {
      if (saving) {
        return;
      }
      setSaving(true);
      try {
        const response = await fetch("/api/artifacts", {
          body: JSON.stringify(artifact),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          toast({
            type: "error",
            description: payload?.error ?? "Failed to save that artifact.",
          });
          return;
        }
        setSaved(true);
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => setSaved(false), 2000);
      } finally {
        setSaving(false);
      }
    },
    [saving],
  );

  return { save, saved, saving };
}
