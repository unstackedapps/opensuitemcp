"use client";

import { FileTextIcon, PanelLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { type FocusEvent, useRef } from "react";
import { AppWordmark } from "@/components/app-wordmark";
import { useAppPortal } from "@/components/portal/context";
import { SidebarHistory } from "@/components/sidebar-history";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import {
  isPeekLayerOpen,
  isSidebarPeekUi,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { PUBLIC_DOCS_ORIGIN } from "@/lib/constants";
import { isOrgAdminRole } from "@/lib/org/types";

function SidebarCollapseButton({
  label,
  onClick,
  onPeekStart,
  onPeekRelease,
}: {
  label: string;
  onClick: () => void;
  onPeekStart?: () => void;
  /** The pointer has left, so a peek this control blocked can start again. */
  onPeekRelease?: () => void;
}) {
  return (
    <SidebarMenuButton
      aria-label={label}
      className="size-8"
      data-testid="sidebar-collapse-button"
      onClick={onClick}
      onFocus={onPeekStart}
      onMouseEnter={onPeekStart}
      onMouseLeave={onPeekRelease}
      type="button"
    >
      <PanelLeft />
    </SidebarMenuButton>
  );
}

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { openPortal } = useAppPortal();
  const {
    setOpenMobile,
    isMobile,
    toggleSidebar,
    state,
    peek,
    setPeek,
    closePeekSoon,
    revealText,
  } = useSidebar();
  const sidebarCollapsed = state === "collapsed";
  const showExpandedChrome = isMobile || !sidebarCollapsed || peek;
  const showAdminLink = isOrgAdminRole(user?.role);

  // Collapsing swaps this control for the expand one, which is a different
  // element in the same place: React mounts it under the cursor, mouseEnter
  // fires, and the panel peeks straight back open. Clicking is an instruction
  // to close, so peek waits until the pointer has actually left the control.
  const peekBlockedRef = useRef(false);

  const handlePeekStart = () => {
    if (isMobile || !sidebarCollapsed || peekBlockedRef.current) {
      return;
    }
    setPeek(true);
  };

  const handlePeekRelease = () => {
    peekBlockedRef.current = false;
  };

  const handleCollapseClick = () => {
    peekBlockedRef.current = true;
    setPeek(false);
    toggleSidebar();
  };

  return (
    <Sidebar
      collapsible="icon"
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (isMobile || !sidebarCollapsed) {
          return;
        }
        if (event.currentTarget.contains(event.relatedTarget)) {
          return;
        }
        if (isSidebarPeekUi(event.relatedTarget) || isPeekLayerOpen()) {
          return;
        }
        closePeekSoon();
      }}
      onPointerEnter={() => {
        if (isMobile || !sidebarCollapsed || !peek) {
          return;
        }
        setPeek(true);
      }}
    >
      {/* pt-1.5 matches the header's py-1.5: both rows then center on the same
          line, which p-2 put 2px out. */}
      <SidebarHeader className="pt-1.5 pb-4">
        {/* The product name sits here, so the main header can carry the thread
            title. The collapse control leads the row, which is where the expand
            control stands when the panel is shut, so it does not move. */}
        <div className="flex h-8 items-center gap-1">
          {isMobile || !sidebarCollapsed ? null : (
            <SidebarCollapseButton
              label="Expand sidebar"
              onClick={handleCollapseClick}
              onPeekRelease={handlePeekRelease}
              onPeekStart={handlePeekStart}
            />
          )}
          {isMobile || sidebarCollapsed ? null : (
            <SidebarCollapseButton
              label="Collapse sidebar"
              onClick={handleCollapseClick}
              onPeekRelease={handlePeekRelease}
            />
          )}
          {showExpandedChrome ? (
            <a
              className="flex min-w-0 flex-1 items-center rounded px-1 text-foreground/95 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              href={PUBLIC_DOCS_ORIGIN}
              rel="noopener noreferrer"
              target="_blank"
              title="Open opensuitemcp.com"
            >
              <AppWordmark className="min-w-0 truncate" />
            </a>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {showExpandedChrome ? (
            <SidebarMenu className="min-w-0 flex-1">
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    href="/"
                    onClick={(event) => {
                      // Let the browser handle new-tab / modified clicks.
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
                      setOpenMobile(false);
                      // The chat page rewrites the URL with
                      // history.replaceState once a chat exists, so the
                      // router still believes it is on "/" and this link
                      // navigates nowhere. Put the URL back and re-render:
                      // the page mints a new chat id, which re-keys Chat.
                      window.history.replaceState({}, "", "/");
                      router.refresh();
                    }}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-current">
                      <Plus className="size-2.5" />
                    </span>
                    {revealText ? (
                      <span>New Chat</span>
                    ) : (
                      <>
                        <span className="sr-only">New Chat</span>
                        <Skeleton
                          aria-hidden
                          className="h-3 w-16 bg-sidebar-accent-foreground/10"
                        />
                      </>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setOpenMobile(false);
                    openPortal("artifacts");
                  }}
                >
                  <FileTextIcon />
                  {revealText ? (
                    <span>Artifacts</span>
                  ) : (
                    <>
                      <span className="sr-only">Artifacts</span>
                      <Skeleton
                        aria-hidden
                        className="h-3 w-12 bg-sidebar-accent-foreground/10"
                      />
                    </>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}
        </div>
      </SidebarHeader>

      {/* flex-1 spacer pins the user footer to the bottom (Claude-style) */}
      <SidebarContent className="gap-0">
        <div
          className={
            showExpandedChrome
              ? "flex min-h-0 flex-1 flex-col"
              : "pointer-events-none invisible hidden"
          }
        >
          <SidebarHistory user={user} />
        </div>
      </SidebarContent>

      <SidebarFooter className="mt-auto">
        {user ? (
          <SidebarUserNav showAdminLink={showAdminLink} user={user} />
        ) : null}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
