"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import { AppReleaseChip } from "@/components/app-release-chip";
import { useAppRelease } from "@/components/app-release-provider";
import { NetSuiteStatusChip } from "@/components/netsuite-status-chip";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlusIcon } from "./icons";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

/** Sidebar expand/collapse lives in the rail on desktop; header keeps a
 *  mobile-only trigger so the sheet can open when the rail is off-canvas. */

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  personaName,
  onPersonaClick,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  personaName?: string;
  /** When set, the persona badge is a button that opens the picker. */
  onPersonaClick?: () => void;
}) {
  const router = useRouter();
  const appRelease = useAppRelease();

  const { width: windowWidth } = useWindowSize();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR, assume desktop size (>= 768) to match initial render
  const isMobile =
    mounted && windowWidth !== undefined ? windowWidth < 768 : false;

  const personaBadgeClassName = cn(
    "order-3 truncate rounded-md border px-2 py-1 text-muted-foreground text-xs",
    onPersonaClick
      ? "inline-flex cursor-pointer transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      : "hidden md:inline-flex",
  );

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      {isMobile ? <SidebarToggle /> : null}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <div className="pointer-events-none order-2 hidden h-8 select-none flex-row items-center justify-center gap-0 rounded-md text-xl md:flex">
        <span
          className="font-light"
          style={{ fontFamily: "var(--font-raleway)" }}
        >
          <span className="tracking-tight">OpenSuite</span>
          <span className="font-semibold">MCP</span>
        </span>
      </div>

      {personaName ? (
        onPersonaClick ? (
          <button
            aria-label={`Change persona (currently ${personaName})`}
            className={personaBadgeClassName}
            data-testid="persona-badge"
            onClick={onPersonaClick}
            title="Change persona"
            type="button"
          >
            {personaName}
          </button>
        ) : (
          <span className={personaBadgeClassName} data-testid="persona-badge">
            {personaName}
          </span>
        )
      ) : null}

      <div
        className={cn(
          "ml-auto flex items-center gap-1.5",
          "order-4 md:order-4",
        )}
      >
        <AppReleaseChip
          installMode={appRelease.installMode}
          latestVersion={appRelease.latestVersion}
          updateAvailable={appRelease.updateAvailable}
          version={appRelease.version}
        />
        {!isReadonly ? <NetSuiteStatusChip /> : null}
        {/* Desktop New Chat lives in the sidebar rail; header + only when the
            mobile sheet is closed and that control isn't visible. */}
        {isMobile ? (
          <Button asChild className="size-8 px-0" variant="outline">
            <Link
              aria-label="New Chat"
              href="/"
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                router.refresh();
              }}
            >
              <PlusIcon />
              <span className="sr-only">New Chat</span>
            </Link>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.personaName === nextProps.personaName &&
    prevProps.onPersonaClick === nextProps.onPersonaClick
  );
});
