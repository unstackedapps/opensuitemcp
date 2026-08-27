"use client";

import type { User } from "next-auth";
import type { ReactNode } from "react";
import { AppPortal } from "@/components/app-portal";
import { AppReleaseProvider } from "@/components/app-release-provider";
import { AppPortalProvider } from "@/components/portal/context";
import type { AppReleaseBadge } from "@/lib/app-release";

export function PortalShell({
  user,
  appRelease,
  children,
}: {
  user: User | undefined;
  appRelease: AppReleaseBadge;
  children: ReactNode;
}) {
  return (
    <AppReleaseProvider value={appRelease}>
      <AppPortalProvider>
        {children}
        <AppPortal user={user} />
      </AppPortalProvider>
    </AppReleaseProvider>
  );
}
