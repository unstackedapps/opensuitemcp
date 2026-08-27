import { AdminSubnav } from "@/components/admin/admin-shell";

const SKILLS_ADMIN_TABS = [
  { href: "/admin/skills/oracle", label: "Oracle" },
  { href: "/admin/skills/community", label: "Community" },
  { href: "/admin/skills/connected", label: "Connected" },
  { href: "/admin/skills/custom", label: "Custom" },
] as const;

export default function SkillsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <AdminSubnav tabs={SKILLS_ADMIN_TABS} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
