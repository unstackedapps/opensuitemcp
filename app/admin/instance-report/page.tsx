import { AdminPanel } from "@/components/admin/admin-shell";
import { InstanceReportPanel } from "@/components/admin/instance-report-panel";
import { getReportTokenState } from "@/lib/instance-report/token";
import { getAdminActor } from "@/lib/org/admin/actor";

export default async function AdminInstanceReportPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }
  const state = await getReportTokenState();

  return (
    <AdminPanel title="Instance report">
      <InstanceReportPanel
        token={
          state.source === "app"
            ? {
                source: "app",
                createdAt: state.createdAt.toISOString(),
                createdByEmail: state.createdByEmail,
              }
            : state
        }
      />
    </AdminPanel>
  );
}
