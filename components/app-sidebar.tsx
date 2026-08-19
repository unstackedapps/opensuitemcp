"use client";

import {
  MessagesSquare,
  PanelLeft,
  Plus,
  Settings,
  Sparkles,
  SunMoon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useTheme } from "next-themes";
import { useAppPortal } from "@/components/portal/context";
import { SidebarHistory } from "@/components/sidebar-history";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile, isMobile, toggleSidebar, state } = useSidebar();
  const { setTheme, resolvedTheme } = useTheme();
  const { openPortal } = useAppPortal();
  const sidebarCollapsed = state === "collapsed";

  return (
    <Sidebar className="group-data-[side=left]:border-r-0" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="New Chat">
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
                <span>New Chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {!isMobile && sidebarCollapsed ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => openPortal("chats")}
                tooltip="Chats"
              >
                <MessagesSquare />
                <span>Chats</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <SidebarMenuButton
              data-testid="sidebar-skills-button"
              onClick={() => openPortal("skills")}
              tooltip="Skills"
            >
              <Sparkles />
              <span>Skills</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              tooltip={resolvedTheme === "light" ? "Dark mode" : "Light mode"}
            >
              <SunMoon />
              <span>Theme</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => openPortal("provider")}
              tooltip="Settings"
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* flex-1 spacer pins the user footer to the bottom (Claude-style) */}
      <SidebarContent className="gap-0">
        {isMobile || !sidebarCollapsed ? <SidebarHistory user={user} /> : null}
      </SidebarContent>

      <SidebarFooter className="mt-auto">
        {!isMobile ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleSidebar}
                tooltip={
                  sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
              >
                <PanelLeft />
                <span>{sidebarCollapsed ? "Expand" : "Collapse"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
        {user && <SidebarUserNav user={user} />}
      </SidebarFooter>
    </Sidebar>
  );
}
