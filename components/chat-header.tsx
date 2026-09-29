"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import { AppReleaseChip } from "@/components/app-release-chip";
import { useAppRelease } from "@/components/app-release-provider";
import { ChatTitleMenu } from "@/components/chat-title-menu";
import { NetSuiteStatusChip } from "@/components/netsuite-status-chip";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlusIcon } from "./icons";
import type { VisibilityType } from "./visibility-selector";

/** Sidebar expand/collapse lives in the rail on desktop; header keeps a
 *  mobile-only trigger so the sheet can open when the rail is off-canvas.
 *
 *  The product name is in the side panel, so this row carries the thread
 *  title. Renaming, sharing and deleting the chat are in its menu. */

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
    "truncate rounded-md px-2 py-1 text-muted-foreground text-xs",
    // The border is on the control only. After the first message the persona is
    // fixed and this renders as plain text, which must not look clickable.
    onPersonaClick
      ? "inline-flex cursor-pointer border border-border transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      : "hidden md:inline-flex",
  );

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      {isMobile ? <SidebarToggle /> : null}

      <ChatTitleMenu
        chatId={chatId}
        isReadonly={isReadonly}
        selectedVisibilityType={selectedVisibilityType}
      />

      <div className="ml-auto flex items-center gap-1.5">
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
                event.preventDefault();
                // See the sidebar control: history.replaceState leaves the
                // router on "/", so this link would navigate nowhere.
                window.history.replaceState({}, "", "/");
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
