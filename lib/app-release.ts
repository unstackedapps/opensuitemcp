import { getInstallMode } from "@/lib/org/install-config";
import packageJson from "../package.json";

export const APP_VERSION = packageJson.version;

export const APP_GITHUB_REPO = "unstackedapps/opensuitemcp";
export const APP_RELEASES_URL = `https://github.com/${APP_GITHUB_REPO}/releases`;

function parseVersion(value: string): number[] {
  const normalized = value.trim().replace(/^v/i, "");
  const core = normalized.split("-")[0] ?? "0";
  return core.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  const length = Math.max(latestParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const latestPart = latestParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;
    if (latestPart > currentPart) {
      return true;
    }
    if (latestPart < currentPart) {
      return false;
    }
  }

  return false;
}

export async function getLatestReleasedVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${APP_GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "OpenSuiteMCP",
        },
        next: { revalidate: 21_600 },
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { tag_name?: string };
    const tag = payload.tag_name?.trim();
    return tag || null;
  } catch {
    return null;
  }
}

export async function getAppReleaseBadge() {
  const latestVersion = await getLatestReleasedVersion();
  const installMode = getInstallMode();

  return {
    version: APP_VERSION,
    latestVersion,
    updateAvailable: latestVersion
      ? isNewerVersion(latestVersion, APP_VERSION)
      : false,
    installMode,
  };
}

export type AppReleaseBadge = Awaited<ReturnType<typeof getAppReleaseBadge>>;
