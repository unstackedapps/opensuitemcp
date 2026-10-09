"use server";

import { revalidatePath } from "next/cache";
import {
  deleteReportToken,
  generateReportToken,
} from "@/lib/instance-report/token";
import {
  type AdminActionResult,
  adminActionFailed,
  adminActionUnauthorized,
} from "@/lib/org/admin/action-result";
import { getAdminActor } from "@/lib/org/admin/actor";

/** Generate the report token, replacing any earlier one. Shown once. */
export async function adminGenerateReportToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const actor = await getAdminActor();
  if (!actor) {
    return { ok: false, error: "Unauthorized." };
  }
  try {
    const token = await generateReportToken(actor.userId);
    revalidatePath("/admin/instance-report");
    revalidatePath("/admin/updates");
    return { ok: true, token };
  } catch (error) {
    const failed = adminActionFailed(error);
    return failed.ok ? { ok: false, error: "Request failed." } : failed;
  }
}

export async function adminDeleteReportToken(): Promise<AdminActionResult> {
  const actor = await getAdminActor();
  if (!actor) {
    return adminActionUnauthorized();
  }
  try {
    await deleteReportToken();
    revalidatePath("/admin/instance-report");
    revalidatePath("/admin/updates");
    return { ok: true };
  } catch (error) {
    return adminActionFailed(error);
  }
}
