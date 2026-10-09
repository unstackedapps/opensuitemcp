"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import type { UpdateRun, UpdateStatus } from "@/lib/updates/control";

const POLL_MS = 3000;
const SELF_HOST_DOCS_URL =
  "https://github.com/unstackedapps/opensuitemcp/blob/main/docs/self-host.md#commands";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function describeRun(run: UpdateRun): string {
  const when = formatWhen(run.finishedAt || run.startedAt);
  if (run.state === "succeeded") {
    return `${run.from} to ${run.to}, ${when}`;
  }
  return `${run.message || `${run.to} didn't install`}, ${when}`;
}

async function readStatus(): Promise<UpdateStatus | null> {
  try {
    const response = await fetch("/api/updates", { cache: "no-store" });
    return response.ok ? ((await response.json()) as UpdateStatus) : null;
  } catch {
    return null;
  }
}

/**
 * App updates, for whoever may update this install: Admin → App updates on an
 * org install, Settings → General on a solo one.
 */
export function AppUpdates() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** The version being installed. The app restarts on it, then this page reloads. */
  const [installing, setInstalling] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef<number>(0);

  const refresh = useCallback(async () => {
    const next = await readStatus();
    if (next) {
      setStatus(next);
    }
    setLoaded(true);
    return next;
  }, []);

  useEffect(() => {
    void refresh().then((first) => {
      const running =
        first?.pending ??
        (first?.lastRun?.state === "running" ? first.lastRun.to : null);
      if (running) {
        startedAt.current = Date.now();
        setInstalling(running);
      }
    });
  }, [refresh]);

  // While an update runs, the app goes away and comes back on the new version.
  useEffect(() => {
    if (!installing) {
      return;
    }
    const timer = setInterval(async () => {
      const next = await refresh();
      if (!next) {
        return;
      }
      if (next.version === installing) {
        clearInterval(timer);
        toast.success(`Updated to ${installing}.`);
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
      const run = next.lastRun;
      const finished =
        run &&
        run.to === installing &&
        (run.state === "rolled_back" || run.state === "failed") &&
        Date.parse(run.startedAt) >= startedAt.current - 60_000;
      if (finished) {
        clearInterval(timer);
        setInstalling(null);
        toast.error(run.message || `${installing} didn't install.`);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [installing, refresh]);

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      version?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Request failed.");
    }
    return payload;
  };

  const startUpdate = async () => {
    setSaving(true);
    try {
      const { version } = await post({ action: "update" });
      startedAt.current = Date.now();
      setInstalling(version ?? status?.latestVersion ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setSaving(false);
    }
  };

  const setPolicy = async (change: {
    autoUpdate?: boolean;
    allowRemote?: boolean;
  }) => {
    if (!status) {
      return;
    }
    const previous = status.policy;
    setStatus({ ...status, policy: { ...previous, ...change } });
    try {
      await post({ action: "policy", ...change });
    } catch (error) {
      setStatus((current) =>
        current ? { ...current, policy: previous } : current,
      );
      toast.error(error instanceof Error ? error.message : "Request failed.");
    }
  };

  if (!loaded) {
    return (
      <SettingRow
        control={<Loader2 className="size-4 animate-spin" />}
        title="OpenSuiteMCP"
      />
    );
  }
  if (!status) {
    return (
      <SettingRow
        description="Couldn't read this install's update status."
        title="OpenSuiteMCP"
      />
    );
  }

  const managed = status.updater !== "none";
  const canInstall =
    status.updater === "ready" && status.updateAvailable && !installing;

  let description: React.ReactNode;
  if (installing) {
    description = `Installing ${installing}. The app restarts, then this page reloads.`;
  } else if (status.updater === "offline") {
    description = (
      <>
        The updater isn't running. On the server, run{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          sudo osmcp compose up -d updater
        </code>
      </>
    );
  } else if (!status.latestVersion) {
    description = "Couldn't check GitHub for a new release.";
  } else if (status.updateAvailable) {
    description = (
      <>
        {status.latestVersion} is available.{" "}
        {status.releaseNotesUrl ? (
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href={status.releaseNotesUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Release notes
          </a>
        ) : null}
      </>
    );
  } else {
    description = "Up to date.";
  }

  return (
    <div className="divide-y divide-border/60">
      <SettingRow
        control={
          installing ? (
            <Button disabled size="sm" variant="outline">
              <Loader2 className="size-4 animate-spin" />
              Installing
            </Button>
          ) : canInstall ? (
            <Button disabled={saving} onClick={startUpdate} size="sm">
              Update to {status.latestVersion}
            </Button>
          ) : managed ? null : (
            <Button asChild size="sm" variant="outline">
              <a
                href={SELF_HOST_DOCS_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                How to update
              </a>
            </Button>
          )
        }
        description={description}
        title={`OpenSuiteMCP ${status.version}`}
      />

      {managed ? (
        <SettingRow
          control={
            <Switch
              aria-label="Automatic updates"
              checked={status.policy.autoUpdate}
              onCheckedChange={(checked) =>
                void setPolicy({ autoUpdate: checked })
              }
            />
          }
          description={`New releases install daily at ${String(status.autoUpdateHourUtc).padStart(2, "0")}:00 UTC.`}
          title="Automatic updates"
        />
      ) : null}

      {managed && status.remoteAvailable ? (
        <SettingRow
          control={
            <Switch
              aria-label="Updates from your operator"
              checked={status.policy.allowRemote}
              onCheckedChange={(checked) =>
                void setPolicy({ allowRemote: checked })
              }
            />
          }
          description="Whoever holds this install's report token can start an update."
          title="Updates from your operator"
        />
      ) : null}

      {status.lastRun && status.lastRun.state !== "running" && !installing ? (
        <SettingRow
          description={describeRun(status.lastRun)}
          title={
            status.lastRun.state === "succeeded"
              ? "Last update"
              : "Last update didn't install"
          }
        />
      ) : null}
    </div>
  );
}
