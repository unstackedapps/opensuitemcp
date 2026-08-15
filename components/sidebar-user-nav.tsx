"use client";

import { ChevronUp, Settings } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import { signOut, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useAppPortal } from "@/components/portal/context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { guestRegex } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { LoaderIcon, SignInIcon } from "./icons";
import { toast } from "./toast";

export function SidebarUserNav({ user }: { user: User }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, status } = useSession();
  const { openPortal } = useAppPortal();
  const { state, isMobile } = useSidebar();
  const iconOnly = state === "collapsed" && !isMobile;

  const isGuest = guestRegex.test(data?.user?.email ?? "");

  // Handle NetSuite connection success/error messages from URL params
  useEffect(() => {
    const netsuiteConnected = searchParams.get("netsuite_connected");
    const error = searchParams.get("error");

    if (netsuiteConnected === "true") {
      toast({
        type: "success",
        description: "NetSuite account connected successfully!",
      });
      // Clean up URL
      router.replace("/");
      openPortal("netsuite");
    } else if (error?.startsWith("netsuite_")) {
      const errorDescription =
        searchParams.get("error_description") || "Unknown error";
      toast({
        type: "error",
        description: `NetSuite connection failed: ${errorDescription}`,
      });
      // Clean up URL
      router.replace("/");
    }
  }, [searchParams, router, openPortal]);

  // Open portal when query param is present
  useEffect(() => {
    const settingsParam = searchParams.get("settings");
    if (settingsParam) {
      const section =
        settingsParam === "netsuite" ||
        settingsParam === "search" ||
        settingsParam === "timezone" ||
        settingsParam === "account" ||
        settingsParam === "provider"
          ? settingsParam
          : "provider";
      openPortal(section);
      router.replace("/");
    }
  }, [searchParams, router, openPortal]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {status === "loading" ? (
              <SidebarMenuButton
                className={cn(
                  "bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                  iconOnly ? "justify-center" : "h-10",
                )}
              >
                {iconOnly ? (
                  <div className="size-6 shrink-0 animate-pulse rounded-full bg-zinc-500/30" />
                ) : (
                  <>
                    <div className="size-6 shrink-0 animate-pulse rounded-full bg-zinc-500/30" />
                    <span className="animate-pulse rounded-md bg-zinc-500/30 text-transparent">
                      Loading
                    </span>
                    <div className="ml-auto animate-spin text-zinc-500">
                      <LoaderIcon />
                    </div>
                  </>
                )}
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                className="h-10 bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                data-testid="user-nav-button"
              >
                <Image
                  alt={user.email ?? "User Avatar"}
                  className="rounded-full"
                  height={24}
                  src={`https://avatar.vercel.sh/${user.email}`}
                  width={24}
                />
                <span
                  className="truncate group-data-[collapsible=icon]:hidden"
                  data-testid="user-account-label"
                >
                  {isGuest ? "Guest" : "Account"}
                </span>
                <ChevronUp className="ml-auto group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-56 w-(--radix-popper-anchor-width)"
            data-testid="user-nav-menu"
            side="top"
          >
            <DropdownMenuLabel className="font-normal" data-testid="user-email">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">
                  Signed in as
                </span>
                <span className="break-all font-medium text-sm">
                  {isGuest ? "Guest" : (user?.email ?? "Account")}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-settings"
              onSelect={() => {
                openPortal("account");
              }}
            >
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-auth"
              onSelect={() => {
                if (status === "loading") {
                  toast({
                    type: "error",
                    description:
                      "Checking authentication status, please try again!",
                  });
                  return;
                }

                if (isGuest) {
                  // Full navigation is more reliable than router.push when the
                  // dropdown unmounts on mobile (iOS often swallows the click).
                  window.location.assign("/login");
                  return;
                }

                void signOut({ redirectTo: "/" });
              }}
            >
              <SignInIcon />
              {isGuest ? "Login to your account" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
