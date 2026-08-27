"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { AppReleaseBadge } from "@/lib/app-release";

const AppReleaseContext = createContext<AppReleaseBadge | null>(null);

export function AppReleaseProvider({
  value,
  children,
}: {
  value: AppReleaseBadge;
  children: ReactNode;
}) {
  return (
    <AppReleaseContext.Provider value={value}>
      {children}
    </AppReleaseContext.Provider>
  );
}

export function useAppRelease() {
  const value = useContext(AppReleaseContext);
  if (!value) {
    throw new Error("useAppRelease must be used within AppReleaseProvider");
  }
  return value;
}
