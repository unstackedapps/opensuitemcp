import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { PortalShell } from "@/components/portal/portal-shell";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getAppReleaseBadge } from "@/lib/app-release";
import { redirectIfNeedsOnboarding } from "@/lib/onboarding/guards";
import { redirectIfNeedsOrgSetup } from "@/lib/org/setup";
import { auth } from "../(auth)/auth";

export const experimental_ppr = true;

export const metadata: Metadata = {
  openGraph: {
    type: "website",
  },
  twitter: {
    card: "summary",
  },
};

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectIfNeedsOrgSetup();
  const session = await auth();
  await redirectIfNeedsOnboarding(session);
  const [cookieStore, appRelease] = await Promise.all([
    cookies(),
    getAppReleaseBadge(),
  ]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <PortalShell appRelease={appRelease} user={session?.user}>
        <AppSidebar user={session?.user} />
        <SidebarInset>{children}</SidebarInset>
      </PortalShell>
    </SidebarProvider>
  );
}
