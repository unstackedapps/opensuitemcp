import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getUser, getUserById } from "@/lib/db/queries";
import { userOidcLoginEmail } from "@/lib/db/schema";
import { isSoloInstallMode } from "@/lib/org/install-config";

function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertSoloInstallMode(): void {
  if (!isSoloInstallMode()) {
    throw new Error("NetSuite login emails can only be managed in solo mode.");
  }
}

export async function listUserOidcLoginEmails(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ email: userOidcLoginEmail.email })
    .from(userOidcLoginEmail)
    .where(eq(userOidcLoginEmail.userId, userId));

  return rows.map((row) => row.email);
}

export async function getUserIdByOidcLoginEmail(
  email: string,
): Promise<string | null> {
  if (!isSoloInstallMode()) {
    return null;
  }

  const normalizedEmail = normalizeLoginEmail(email);
  const [row] = await db
    .select({ userId: userOidcLoginEmail.userId })
    .from(userOidcLoginEmail)
    .where(eq(userOidcLoginEmail.email, normalizedEmail))
    .limit(1);

  return row?.userId ?? null;
}

export async function resolveUserForOidcLoginEmail(
  email: string,
): Promise<Awaited<ReturnType<typeof getUserById>>> {
  const normalizedEmail = normalizeLoginEmail(email);
  const [byPrimary] = await getUser(normalizedEmail);
  if (byPrimary) {
    return byPrimary;
  }

  const linkedUserId = await getUserIdByOidcLoginEmail(normalizedEmail);
  if (!linkedUserId) {
    return null;
  }

  return getUserById(linkedUserId);
}

export async function linkUserOidcLoginEmail({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<{ email: string; created: boolean }> {
  assertSoloInstallMode();

  const normalizedEmail = normalizeLoginEmail(email);
  if (!normalizedEmail) {
    throw new Error("NetSuite email is required.");
  }

  const owner = await getUserById(userId);
  if (!owner) {
    throw new Error("User not found.");
  }

  if (owner.email === normalizedEmail) {
    return { email: normalizedEmail, created: false };
  }

  const [primaryOwner] = await getUser(normalizedEmail);
  if (primaryOwner && primaryOwner.id !== userId) {
    throw new Error("This NetSuite email belongs to another account.");
  }

  const existingOwnerId = await getUserIdByOidcLoginEmail(normalizedEmail);
  if (existingOwnerId && existingOwnerId !== userId) {
    throw new Error(
      "This NetSuite email is already linked to another account.",
    );
  }

  const [existingLink] = await db
    .select({ id: userOidcLoginEmail.id })
    .from(userOidcLoginEmail)
    .where(
      and(
        eq(userOidcLoginEmail.userId, userId),
        eq(userOidcLoginEmail.email, normalizedEmail),
      ),
    )
    .limit(1);

  if (existingLink) {
    return { email: normalizedEmail, created: false };
  }

  await db.insert(userOidcLoginEmail).values({
    userId,
    email: normalizedEmail,
  });

  return { email: normalizedEmail, created: true };
}

export async function unlinkUserOidcLoginEmail({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<void> {
  assertSoloInstallMode();

  const normalizedEmail = normalizeLoginEmail(email);
  await db
    .delete(userOidcLoginEmail)
    .where(
      and(
        eq(userOidcLoginEmail.userId, userId),
        eq(userOidcLoginEmail.email, normalizedEmail),
      ),
    );
}
