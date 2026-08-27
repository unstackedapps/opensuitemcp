"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { isSoloInstallMode } from "@/lib/org/install-config";
import { isSoloBootstrapOpen } from "@/lib/org/solo-bootstrap";
import { saveSoloOidcLoginConfig } from "@/lib/org/solo-oidc-login";

const netsuiteOidcSchema = z.object({
  accountId: z.string().min(1).max(64),
  clientId: z.string().min(1).max(128),
});

export async function startSoloNetSuiteLogin(formData: FormData) {
  if (!isSoloInstallMode()) {
    redirect("/login");
  }

  if (!(await isSoloBootstrapOpen())) {
    redirect("/login?error=oidc_setup_locked");
  }

  const validated = netsuiteOidcSchema.safeParse({
    accountId: formData.get("accountId"),
    clientId: formData.get("clientId"),
  });

  if (!validated.success) {
    redirect("/login?error=invalid_data");
  }

  const saved = await saveSoloOidcLoginConfig({
    accountId: validated.data.accountId,
    clientId: validated.data.clientId,
  });

  const accountId = encodeURIComponent(
    normalizeNetSuiteAccountId(saved.accountId),
  );
  redirect(
    `/api/auth/netsuite/authorize?intent=login&returnTo=/&accountId=${accountId}`,
  );
}
