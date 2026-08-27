import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { requireOrgAdminSession } from "@/lib/org/setup";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isOrgInstallMode()) {
    redirect("/");
  }

  const session = await auth();
  const admin = await requireOrgAdminSession(session);

  return <AdminShell role={admin.role}>{children}</AdminShell>;
}
