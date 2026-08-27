import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userOidcConnectionLink } from "@/lib/db/schema";
import { isSoloInstallMode } from "@/lib/org/install-config";

function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertSoloInstallMode(): void {
  if (!isSoloInstallMode()) {
    throw new Error("OIDC connection links can only be managed in solo mode.");
  }
}

export type OidcConnectionLinkRow = {
  orgOidcAccountId: string;
  email: string;
  verifiedAt: Date;
};

export async function listOidcConnectionLinksForUser(
  userId: string,
): Promise<OidcConnectionLinkRow[]> {
  return db
    .select({
      orgOidcAccountId: userOidcConnectionLink.orgOidcAccountId,
      email: userOidcConnectionLink.email,
      verifiedAt: userOidcConnectionLink.verifiedAt,
    })
    .from(userOidcConnectionLink)
    .where(eq(userOidcConnectionLink.userId, userId));
}

export async function upsertOidcConnectionLink({
  userId,
  orgOidcAccountId,
  email,
}: {
  userId: string;
  orgOidcAccountId: string;
  email: string;
}): Promise<OidcConnectionLinkRow> {
  assertSoloInstallMode();

  const normalizedEmail = normalizeLoginEmail(email);
  if (!normalizedEmail) {
    throw new Error("NetSuite email is required.");
  }

  const [row] = await db
    .insert(userOidcConnectionLink)
    .values({
      userId,
      orgOidcAccountId,
      email: normalizedEmail,
      verifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        userOidcConnectionLink.userId,
        userOidcConnectionLink.orgOidcAccountId,
      ],
      set: {
        email: normalizedEmail,
        verifiedAt: new Date(),
      },
    })
    .returning({
      orgOidcAccountId: userOidcConnectionLink.orgOidcAccountId,
      email: userOidcConnectionLink.email,
      verifiedAt: userOidcConnectionLink.verifiedAt,
    });

  if (!row) {
    throw new Error("Failed to save OIDC connection link.");
  }

  return row;
}

export async function deleteOidcConnectionLinkForAccount({
  orgOidcAccountId,
}: {
  orgOidcAccountId: string;
}): Promise<void> {
  await db
    .delete(userOidcConnectionLink)
    .where(eq(userOidcConnectionLink.orgOidcAccountId, orgOidcAccountId));
}

export async function deleteOidcConnectionLinksForUser({
  userId,
  orgOidcAccountId,
}: {
  userId: string;
  orgOidcAccountId: string;
}): Promise<void> {
  await db
    .delete(userOidcConnectionLink)
    .where(
      and(
        eq(userOidcConnectionLink.userId, userId),
        eq(userOidcConnectionLink.orgOidcAccountId, orgOidcAccountId),
      ),
    );
}
