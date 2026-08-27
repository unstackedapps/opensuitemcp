import "server-only";

import { compare } from "bcrypt-ts";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getUserById } from "@/lib/db/queries";
import { user } from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import { isSoloInstallMode } from "@/lib/org/install-config";

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export async function changeUserPassword({
  userId,
  currentPassword,
  newPassword,
}: {
  userId: string;
  currentPassword?: string;
  newPassword: string;
}): Promise<ChangePasswordResult> {
  if (newPassword.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  const existing = await getUserById(userId);
  if (!existing) {
    return { ok: false, error: "User not found." };
  }

  if (!existing.password) {
    if (!isSoloInstallMode()) {
      return {
        ok: false,
        error: "This account uses NetSuite sign-in only.",
      };
    }

    await db
      .update(user)
      .set({
        password: generateHashedPassword(newPassword),
        mustResetPassword: false,
      })
      .where(eq(user.id, userId));

    return { ok: true };
  }

  const skipCurrentPassword = existing.mustResetPassword;

  if (skipCurrentPassword) {
    const sameAsTemporary = await compare(newPassword, existing.password);
    if (sameAsTemporary) {
      return {
        ok: false,
        error: "Choose a password different from the temporary one.",
      };
    }
  }

  if (!skipCurrentPassword) {
    if (!currentPassword) {
      return { ok: false, error: "Current password is required." };
    }

    const valid = await compare(currentPassword, existing.password);
    if (!valid) {
      return { ok: false, error: "Current password is incorrect." };
    }

    if (currentPassword === newPassword) {
      return {
        ok: false,
        error: "New password must be different from the current password.",
      };
    }
  }

  await db
    .update(user)
    .set({
      password: generateHashedPassword(newPassword),
      mustResetPassword: false,
    })
    .where(eq(user.id, userId));

  return { ok: true };
}
