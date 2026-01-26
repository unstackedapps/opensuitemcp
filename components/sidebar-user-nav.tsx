"use client";

import { ChevronUp, Settings } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { guestRegex } from "@/lib/constants";
import { LoaderIcon, SignInIcon } from "./icons";
import { SettingsModal } from "./settings-modal";
import { toast } from "./toast";

export function SidebarUserNav({ user }: { user: User }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, status } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      // Open settings modal to show connection status
      setSettingsOpen(true);
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
  }, [searchParams, router]);

  // Open settings modal when query param is present
  useEffect(() => {
    const settingsParam = searchParams.get("settings");
    if (settingsParam) {
      setSettingsOpen(true);
      router.replace("/");
    }
  }, [searchParams, router]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {status === "loading" ? (
              <SidebarMenuButton className="h-10 justify-between bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                <div className="flex flex-row gap-2">
                  <div className="size-6 animate-pulse rounded-full bg-zinc-500/30" />
                  <span className="animate-pulse rounded-md bg-zinc-500/30 text-transparent">
                    Loading auth status
                  </span>
                </div>
                <div className="animate-spin text-zinc-500">
                  <LoaderIcon />
                </div>
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
                <span className="truncate" data-testid="user-email">
                  {isGuest ? "Guest" : user?.email}
                </span>
                <ChevronUp className="ml-auto" />
              </SidebarMenuButton>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-popper-anchor-width)"
            data-testid="user-nav-menu"
            side="top"
          >
            <DropdownMenuItem
              className="cursor-pointer"
              data-testid="user-nav-item-settings"
              onSelect={() => {
                setSettingsOpen(true);
              }}
            >
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild data-testid="user-nav-item-auth">
              <button
                className="flex w-full cursor-pointer items-center gap-2"
                onClick={() => {
                  if (status === "loading") {
                    toast({
                      type: "error",
                      description:
                        "Checking authentication status, please try again!",
                    });

                    return;
                  }

                  if (isGuest) {
                    router.push("/login");
                  } else {
                    signOut({
                      redirectTo: "/",
                    });
                  }
                }}
                type="button"
              >
                <SignInIcon />
                {isGuest ? "Login to your account" : "Sign out"}
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <SettingsModal onOpenChange={setSettingsOpen} open={settingsOpen} />
    </SidebarMenu>
  );
}
