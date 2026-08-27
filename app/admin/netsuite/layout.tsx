import { AdminSubnav } from "@/components/admin/admin-shell";

const NETSUITE_ADMIN_TABS = [
  { href: "/admin/netsuite/mcp", label: "MCP Connections" },
  { href: "/admin/netsuite/oidc", label: "OIDC Login" },
] as const;

export default function NetSuiteAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <AdminSubnav tabs={NETSUITE_ADMIN_TABS} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
