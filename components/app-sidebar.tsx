"use client";

import { PanelLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import type { FocusEvent } from "react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
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
      className="group-data-[side=left]:border-r-0"
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
      <SidebarHeader>
        <div className="flex items-center gap-1">
          {isMobile || !sidebarCollapsed ? null : (
            <SidebarCollapseButton
              label="Expand sidebar"
              onClick={handleCollapseClick}
              onPeekStart={handlePeekStart}
            />
          )}
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
                      setOpenMobile(false);
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
          {isMobile || sidebarCollapsed ? null : (
            <SidebarCollapseButton
              label="Collapse sidebar"
              onClick={handleCollapseClick}
            />
          )}
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
    </Sidebar>
  );
}
