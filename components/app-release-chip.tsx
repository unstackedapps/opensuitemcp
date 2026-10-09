import Link from "next/link";
import { APP_RELEASES_URL } from "@/lib/app-release";
import type { OsmcpInstallMode } from "@/lib/org/install-config";
import { cn } from "@/lib/utils";

type AppReleaseChipProps = {
  version: string;
  installMode: OsmcpInstallMode;
  updateAvailable?: boolean;
  latestVersion?: string | null;
  /** Where this person installs updates; null when they can't. */
  updatesHref?: string | null;
  className?: string;
};

const chipClassName =
  "inline-flex max-w-full items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground";

export function AppReleaseChip({
  version,
  installMode,
  updateAvailable = false,
  latestVersion,
  updatesHref,
  className,
}: AppReleaseChipProps) {
  const modeLabel = installMode === "org" ? "Org" : "Personal";
  const label = (
    <>
      <span className="font-medium text-foreground">v{version}</span>
      <span className="mx-1 text-border">·</span>
      <span>{modeLabel}</span>
    </>
  );

  // Only someone who can install the update is told there is one.
  if (updateAvailable && updatesHref) {
    return (
      <Link
        className={cn(chipClassName, className)}
        href={updatesHref}
        title={latestVersion ? `Update to ${latestVersion}` : undefined}
      >
        {label}
        <span className="mx-1 text-border">·</span>
        <span className="text-amber-600 dark:text-amber-400">Update</span>
      </Link>
    );
  }

  return (
    <a
      className={cn(chipClassName, className)}
      href={APP_RELEASES_URL}
      rel="noopener noreferrer"
      target="_blank"
      title={`OpenSuiteMCP ${version}`}
    >
      {label}
    </a>
  );
}
