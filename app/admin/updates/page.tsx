import { AdminPanel } from "@/components/admin/admin-shell";
import { AppUpdates } from "@/components/app-updates";
import { getAdminActor } from "@/lib/org/admin/actor";

export default async function AdminUpdatesPage() {
  const actor = await getAdminActor();
  if (!actor) {
    return null;
  }

  return (
    <AdminPanel title="App updates">
      <AppUpdates />
    </AdminPanel>
  );
}
