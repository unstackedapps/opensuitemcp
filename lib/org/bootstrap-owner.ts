import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { createOAuthUser, createUser, getUser } from "@/lib/db/queries";
import { org, user as userTable } from "@/lib/db/schema";
import { normalizeBootstrapEmail } from "@/lib/org/bootstrap-config";
import { grantUserAllOrgLlmProviders } from "@/lib/org/llm-providers";
import { grantUserAllOrgPersonas } from "@/lib/org/personas";
import { assignUserOrgRole, ensureDefaultOrg } from "@/lib/org/queries";
import { ensureOrgSearchCatalog } from "@/lib/org/search-resources";
import { DEFAULT_OWNER_NAME } from "@/lib/org/types";

async function setOwnerDefaultName(userId: string): Promise<void> {
  await db
    .update(userTable)
    .set({ name: DEFAULT_OWNER_NAME })
    .where(eq(userTable.id, userId));
}

async function renameDefaultOrg(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }

  const defaultOrg = await ensureDefaultOrg();
  await db
    .update(org)
    .set({ name: trimmed.slice(0, 128) })
    .where(eq(org.id, defaultOrg.id));
}

export async function createOwnerUser({
  email,
  password,
  orgName,
}: {
  email: string;
  password: string;
  orgName?: string;
}): Promise<void> {
  await createUser(email, password);
  const [ownerUser] = await getUser(email);
  if (!ownerUser) {
    throw new Error("Failed to create owner user");
  }

  await setOwnerDefaultName(ownerUser.id);

  const defaultOrg = await ensureDefaultOrg();
  if (orgName?.trim()) {
    await renameDefaultOrg(orgName);
  }

  await assignUserOrgRole({
    userId: ownerUser.id,
    orgId: defaultOrg.id,
    role: "owner",
  });

  await ensureOrgSearchCatalog(defaultOrg.id);
  await grantUserAllOrgLlmProviders({
    userId: ownerUser.id,
    orgId: defaultOrg.id,
  });
  await grantUserAllOrgPersonas({ userId: ownerUser.id, orgId: defaultOrg.id });
}

export async function createOwnerFromOAuth(email: string) {
  const normalizedEmail = normalizeBootstrapEmail(email);
  const [existingUser] = await getUser(normalizedEmail);
  const ownerUser = existingUser ?? (await createOAuthUser(normalizedEmail));

  await setOwnerDefaultName(ownerUser.id);

  const defaultOrg = await ensureDefaultOrg();
  await assignUserOrgRole({
    userId: ownerUser.id,
    orgId: defaultOrg.id,
    role: "owner",
  });

  await ensureOrgSearchCatalog(defaultOrg.id);
  await grantUserAllOrgLlmProviders({
    userId: ownerUser.id,
    orgId: defaultOrg.id,
  });
  await grantUserAllOrgPersonas({ userId: ownerUser.id, orgId: defaultOrg.id });

  return ownerUser;
}
