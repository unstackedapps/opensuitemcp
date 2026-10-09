import "server-only";

import { randomUUID } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Session } from "next-auth";
import {
  APP_GITHUB_REPO,
  APP_VERSION,
  getLatestReleasedVersion,
  isNewerVersion,
} from "@/lib/app-release";
import { getReportTokenState } from "@/lib/instance-report/token";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { canManageUpdates } from "@/lib/updates/access";

/**
 * The app's side of updating itself.
 *
 * An install made with deploy/install.sh runs an updater container beside the
 * app, and the two share one folder, mounted here at OSMCP_CONTROL_DIR:
 *
 * - request.json  the app writes it to ask for an update; the updater deletes it
 * - policy.json   the app writes it; the updater reads autoUpdate
 * - status.json   `osmcp update` writes the last run's outcome
 * - heartbeat     the updater rewrites it every 5 seconds
 *
 * Any other install (pnpm start, or Compose without the updater) has no such
 * folder, and is updated from its server.
 */

export const UPDATE_CONTROL_DIR_ENV = "OSMCP_CONTROL_DIR";

/** The updater rewrites its heartbeat every 5 seconds. */
const HEARTBEAT_STALE_MS = 60_000;

export type UpdaterState = "ready" | "offline" | "none";

export type UpdateRun = {
  state: "running" | "succeeded" | "rolled_back" | "failed";
  from: string;
  to: string;
  startedAt: string;
  finishedAt: string;
  message: string;
};

export type UpdatePolicy = {
  autoUpdate: boolean;
  allowRemote: boolean;
};

export type UpdateRequester = "admin" | "settings" | "operator";

export type UpdateStatus = {
  version: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseNotesUrl: string | null;
  updater: UpdaterState;
  /** A version asked for that the updater has not started on yet. */
  pending: string | null;
  lastRun: UpdateRun | null;
  policy: UpdatePolicy;
  /** The instance report token is set, so an operator could push an update. */
  remoteAvailable: boolean;
  autoUpdateHourUtc: number;
};

const DEFAULT_POLICY: UpdatePolicy = { autoUpdate: false, allowRemote: false };

function controlDir(): string | null {
  const dir = process.env[UPDATE_CONTROL_DIR_ENV]?.trim();
  return dir ? dir : null;
}

/**
 * Where this person installs updates in the app, or null. Org admins always
 * have Admin → App updates. A solo install shows App updates in Settings →
 * General only when it has an updater, so an install run by someone else (the
 * hosted app) shows its users nothing.
 */
export function appUpdatesHref(session: Session | null): string | null {
  if (!canManageUpdates(session)) {
    return null;
  }
  if (isOrgInstallMode()) {
    return "/admin/updates";
  }
  return controlDir() ? "/?settings=general" : null;
}

function autoUpdateHourUtc(): number {
  const hour = Number.parseInt(process.env.OSMCP_AUTO_UPDATE_HOUR ?? "", 10);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 3;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Write whole or not at all: the updater may read the file at any moment. */
async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value)}\n`, { mode: 0o664 });
  await rename(temp, file);
}

async function updaterState(dir: string | null): Promise<UpdaterState> {
  if (!dir) {
    return "none";
  }
  try {
    const beat = await stat(path.join(dir, "heartbeat"));
    return Date.now() - beat.mtimeMs < HEARTBEAT_STALE_MS ? "ready" : "offline";
  } catch {
    return "offline";
  }
}

export async function readUpdatePolicy(): Promise<UpdatePolicy> {
  const dir = controlDir();
  if (!dir) {
    return DEFAULT_POLICY;
  }
  const stored = await readJson<Partial<UpdatePolicy>>(
    path.join(dir, "policy.json"),
  );
  return {
    autoUpdate: stored?.autoUpdate === true,
    allowRemote: stored?.allowRemote === true,
  };
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const dir = controlDir();
  const [latestVersion, updater, policy, request, lastRun, reportToken] =
    await Promise.all([
      getLatestReleasedVersion({ maxAgeSeconds: 300 }),
      updaterState(dir),
      readUpdatePolicy(),
      dir
        ? readJson<{ version?: string }>(path.join(dir, "request.json"))
        : null,
      dir ? readJson<UpdateRun>(path.join(dir, "status.json")) : null,
      getReportTokenState(),
    ]);
  const latest = latestVersion?.replace(/^v/i, "") ?? null;

  return {
    version: APP_VERSION,
    latestVersion: latest,
    updateAvailable: latest ? isNewerVersion(latest, APP_VERSION) : false,
    releaseNotesUrl: latest
      ? `https://github.com/${APP_GITHUB_REPO}/releases/tag/v${latest}`
      : null,
    updater,
    pending: request?.version ?? null,
    lastRun,
    policy,
    remoteAvailable: reportToken.source !== "none",
    autoUpdateHourUtc: autoUpdateHourUtc(),
  };
}

export class UpdateRequestError extends Error {}

/**
 * Ask the updater to install `version`, or the latest release when it is
 * omitted. Returns the version asked for.
 */
export async function requestUpdate({
  version,
  requestedBy,
}: {
  version?: string;
  requestedBy: UpdateRequester;
}): Promise<string> {
  const dir = controlDir();
  if (!dir) {
    throw new UpdateRequestError(
      "This install has no updater. Update it from its server.",
    );
  }
  if ((await updaterState(dir)) !== "ready") {
    throw new UpdateRequestError(
      "The updater isn't running. On the server, run: sudo osmcp compose up -d updater",
    );
  }

  let target = version?.trim().replace(/^v/i, "");
  if (!target) {
    const latest = await getLatestReleasedVersion({ maxAgeSeconds: 0 });
    target = latest?.replace(/^v/i, "");
    if (!target) {
      throw new UpdateRequestError(
        "Couldn't read the latest release from GitHub.",
      );
    }
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(target)) {
    throw new UpdateRequestError(`"${target}" isn't a release version.`);
  }

  await writeJsonAtomic(path.join(dir, "request.json"), {
    version: target,
    requestedBy,
    requestedAt: new Date().toISOString(),
  });
  return target;
}

export async function setUpdatePolicy(
  change: Partial<UpdatePolicy>,
): Promise<UpdatePolicy> {
  const dir = controlDir();
  if (!dir) {
    throw new UpdateRequestError(
      "This install has no updater. Update it from its server.",
    );
  }
  const current = await readUpdatePolicy();
  // A switch left out of `change` keeps its value; spreading an undefined
  // field would drop it from the file and turn it off.
  const next: UpdatePolicy = {
    autoUpdate: change.autoUpdate ?? current.autoUpdate,
    allowRemote: change.allowRemote ?? current.allowRemote,
  };
  await writeJsonAtomic(path.join(dir, "policy.json"), next);
  return next;
}
