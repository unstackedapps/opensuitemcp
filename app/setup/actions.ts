"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/app/(auth)/auth";
import { getUser } from "@/lib/db/queries";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import {
  isBootstrapEmailAllowed,
  isOrgBootstrapConfigured,
} from "@/lib/org/bootstrap-config";
import { createOwnerUser } from "@/lib/org/bootstrap-owner";
import {
  getNetSuiteAccountIdFromEnv,
  getNetSuiteOidcClientIdFromEnv,
} from "@/lib/org/install-config";
import { upsertOrgOidcAccount } from "@/lib/org/oidc-accounts";
import { ensureDefaultOrg } from "@/lib/org/queries";
import { needsOrgSetup } from "@/lib/org/setup";
import { allowAuthAttempt } from "@/lib/rate-limit";

const bootstrapSchema = z.object({
  orgName: z.string().max(128).optional(),
  email: z.string().email(),
  password: z.string().min(6),
});

const netsuiteOidcSchema = z.object({
  accountId: z.string().min(1).max(64),
  clientId: z.string().min(1).max(128),
});

export type BootstrapActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data"
    | "already_configured"
    | "bootstrap_not_configured"
    | "root_email_mismatch";
};

export async function bootstrapOrgOwner(
  _: BootstrapActionState,
  formData: FormData,
): Promise<BootstrapActionState> {
  try {
    if (!(await needsOrgSetup())) {
      return { status: "already_configured" };
    }

    if (!isOrgBootstrapConfigured()) {
      return { status: "bootstrap_not_configured" };
    }

    const validated = bootstrapSchema.parse({
      orgName: formData.get("orgName") || undefined,
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!isBootstrapEmailAllowed(validated.email)) {
      return { status: "root_email_mismatch" };
    }

    if (!(await allowAuthAttempt(validated.email))) {
      return { status: "failed" };
    }

    const existing = await getUser(validated.email);
    if (existing.length > 0) {
      return { status: "user_exists" };
    }

    await createOwnerUser(validated);

    await signIn("credentials", {
      email: validated.email,
      password: validated.password,
      redirectTo: "/onboarding",
    });

    return { status: "success" };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }
    return { status: "failed" };
  }
}

export async function startNetSuiteBootstrap(formData: FormData) {
  if (!(await needsOrgSetup())) {
    redirect("/");
  }

  if (!isOrgBootstrapConfigured()) {
    redirect("/setup?error=bootstrap_not_configured");
  }

  const validated = netsuiteOidcSchema.safeParse({
    accountId: formData.get("accountId"),
    clientId: formData.get("clientId"),
  });

  if (!validated.success) {
    redirect("/setup?error=invalid_data");
  }

  await upsertOrgOidcAccount({
    orgId: (await ensureDefaultOrg()).id,
    accountId: validated.data.accountId,
    clientId: validated.data.clientId,
  });

  const accountId = encodeURIComponent(
    normalizeNetSuiteAccountId(validated.data.accountId),
  );
  redirect(
    `/api/auth/netsuite/authorize?intent=bootstrap&returnTo=/onboarding&accountId=${accountId}`,
  );
}

export async function startNetSuiteBootstrapFromEnv() {
  if (!(await needsOrgSetup())) {
    redirect("/");
  }

  if (!isOrgBootstrapConfigured()) {
    redirect("/setup?error=bootstrap_not_configured");
  }

  const accountId = getNetSuiteAccountIdFromEnv();
  const clientId = getNetSuiteOidcClientIdFromEnv();
  if (!accountId?.trim() || !clientId?.trim()) {
    redirect("/setup?error=invalid_data");
  }

  await upsertOrgOidcAccount({
    orgId: (await ensureDefaultOrg()).id,
    accountId,
    clientId,
  });

  const normalizedAccountId = encodeURIComponent(
    normalizeNetSuiteAccountId(accountId),
  );
  redirect(
    `/api/auth/netsuite/authorize?intent=bootstrap&returnTo=/onboarding&accountId=${normalizedAccountId}`,
  );
}
