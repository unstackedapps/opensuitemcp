"use client";

import {
  Blocks,
  BookOpen,
  Cloud,
  Globe,
  MessagesSquare,
  PanelLeft,
  Plus,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import {
  type PortalSectionId,
  useAppPortal,
} from "@/components/portal/context";
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
import { isOrgAdminRole } from "@/lib/org/types";

const QUICK_ACTIONS: Array<{
  id: PortalSectionId;
  label: string;
  icon: typeof Sparkles;
  testId?: string;
}> = [
  { id: "personas", label: "Personas", icon: UserRound },
  {
    id: "skills",
    label: "Skills",
    icon: Blocks,
    testId: "sidebar-skills-button",
  },
  { id: "prompts", label: "Prompts", icon: BookOpen },
  { id: "provider", label: "AI Provider", icon: Sparkles },
  { id: "netsuite", label: "NetSuite", icon: Cloud },
  { id: "search", label: "Web Search", icon: Globe },
];

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile, isMobile, toggleSidebar, state } = useSidebar();
  const { openPortal } = useAppPortal();
  const sidebarCollapsed = state === "collapsed";
  const showAdminLink = isOrgAdminRole(user?.role);

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
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <SidebarMenuItem key={action.id}>
                <SidebarMenuButton
                  data-testid={action.testId}
                  onClick={() => openPortal(action.id)}
                  tooltip={action.label}
                >
                  <Icon />
                  <span>{action.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
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
        {user ? (
          <SidebarUserNav showAdminLink={showAdminLink} user={user} />
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
