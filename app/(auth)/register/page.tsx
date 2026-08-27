import { redirect } from "next/navigation";
import { isOrgInstallMode } from "@/lib/org/install-config";
import { isSoloBootstrapOpen } from "@/lib/org/solo-bootstrap";

export default async function Page() {
  if (isOrgInstallMode()) {
    redirect("/login");
  }

  if (await isSoloBootstrapOpen()) {
    redirect("/login?account=create");
  }

  redirect("/login");
}
