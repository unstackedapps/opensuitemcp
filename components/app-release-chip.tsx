import { APP_RELEASES_URL } from "@/lib/app-release";
import type { OsmcpInstallMode } from "@/lib/org/install-config";
import { cn } from "@/lib/utils";

type AppReleaseChipProps = {
  version: string;
  installMode: OsmcpInstallMode;
  updateAvailable?: boolean;
  latestVersion?: string | null;
  className?: string;
};

export function AppReleaseChip({
  version,
  installMode,
  updateAvailable = false,
  latestVersion,
  className,
}: AppReleaseChipProps) {
  const modeLabel = installMode === "org" ? "Org" : "Personal";

  return (
    <a
      className={cn(
        "inline-flex max-w-full items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground",
        className,
      )}
      href={APP_RELEASES_URL}
      rel="noopener noreferrer"
      target="_blank"
      title={
        updateAvailable && latestVersion
          ? `Update available: ${latestVersion}`
          : `OpenSuiteMCP ${version}`
      }
    >
      <span className="font-medium text-foreground">v{version}</span>
      <span className="mx-1 text-border">·</span>
      <span>{modeLabel}</span>
      {updateAvailable ? (
        <>
          <span className="mx-1 text-border">·</span>
          <span className="text-amber-600 dark:text-amber-400">Update</span>
        </>
      ) : null}
    </a>
  );
}
