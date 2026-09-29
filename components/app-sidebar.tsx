"use client";

import { PanelLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import type { FocusEvent } from "react";
import { AppWordmark } from "@/components/app-wordmark";
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
}: {
  label: string;
  onClick: () => void;
  onPeekStart?: () => void;
}) {
  return (
    <SidebarMenuButton
      aria-label={label}
      className="size-8"
      data-testid="sidebar-collapse-button"
      onClick={onClick}
      onFocus={onPeekStart}
      onMouseEnter={onPeekStart}
      type="button"
    >
      <PanelLeft />
    </SidebarMenuButton>
  );
}

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
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

  const handlePeekStart = () => {
    if (isMobile || !sidebarCollapsed) {
      return;
    }
    setPeek(true);
  };

  const handleCollapseClick = () => {
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
      {/* pt-1.5 matches the header's py-1.5: both rows then centre on the same
          line, which p-2 put 2px out. */}
      <SidebarHeader className="pt-1.5">
        {/* The product name sits here, so the main header can carry the thread
            title. The collapse control leads the row, which is where the expand
            control stands when the panel is shut, so it does not move. */}
        <div className="flex h-8 items-center gap-1">
          {isMobile || !sidebarCollapsed ? null : (
            <SidebarCollapseButton
              label="Expand sidebar"
              onClick={handleCollapseClick}
              onPeekStart={handlePeekStart}
            />
          )}
          {isMobile || sidebarCollapsed ? null : (
            <SidebarCollapseButton
              label="Collapse sidebar"
              onClick={handleCollapseClick}
            />
          )}
          {showExpandedChrome ? (
            <a
              className="min-w-0 flex-1 truncate rounded px-1 text-sidebar-foreground/90 transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              href={PUBLIC_DOCS_ORIGIN}
              rel="noopener noreferrer"
              target="_blank"
              title="Open opensuitemcp.com"
            >
              <AppWordmark />
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
                    <Plus />
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
