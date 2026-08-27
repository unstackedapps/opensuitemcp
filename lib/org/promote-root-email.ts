import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { org, user, userRole } from "@/lib/db/schema";
import { DEFAULT_ORG_NAME, DEFAULT_OWNER_NAME } from "./types";

/**
 * CLI-safe org bootstrap helpers (no `server-only` — used by `lib/db/migrate.ts`).
 */

async function getDefaultOrg() {
  const [result] = await db.select().from(org).limit(1);
  return result ?? null;
}

async function ensureDefaultOrg() {
  const existing = await getDefaultOrg();
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(org)
    .values({
      name: DEFAULT_ORG_NAME,
      createdAt: new Date(),
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create default org");
  }

  return created;
}

async function hasOrgOwner(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: userRole.userId })
    .from(userRole)
    .where(and(eq(userRole.orgId, orgId), eq(userRole.role, "owner")))
    .limit(1);

  return Boolean(row);
}

export async function promoteUserToOwnerByEmail(
  email: string,
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const [matchedUser] = await db
    .select()
    .from(user)
    .where(eq(user.email, normalizedEmail))
    .limit(1);

  if (!matchedUser) {
    return false;
  }

  const defaultOrg = await ensureDefaultOrg();

  if (await hasOrgOwner(defaultOrg.id)) {
    return false;
  }

  await db
    .update(user)
    .set({ name: DEFAULT_OWNER_NAME })
    .where(eq(user.id, matchedUser.id));

  await db
    .insert(userRole)
    .values({
      userId: matchedUser.id,
      orgId: defaultOrg.id,
      role: "owner",
    })
    .onConflictDoUpdate({
      target: [userRole.userId, userRole.orgId],
      set: { role: "owner" },
    });

  return true;
}

/**
 * On deploy, promote OSMCP_ROOT_EMAIL to owner when no owner exists yet.
 * Safe to run after every migration — does not override an existing owner.
 */
export async function applyRootEmailOwnerIfConfigured(): Promise<void> {
  const rootEmail =
    process.env.OSMCP_ROOT_EMAIL?.trim() ||
    process.env.OPENSUITE_ROOT_EMAIL?.trim();
  if (!rootEmail) {
    return;
  }

  const promoted = await promoteUserToOwnerByEmail(rootEmail);
  if (promoted) {
    console.log(
      `[org] Promoted ${rootEmail} to org owner via OSMCP_ROOT_EMAIL`,
    );
  }
}
