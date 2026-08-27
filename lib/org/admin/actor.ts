import "server-only";

import { auth } from "@/app/(auth)/auth";
import type { OrgRole } from "@/lib/db/schema";
import { sessionIsOrgAdmin } from "@/lib/org/session";

export type AdminActor = {
  userId: string;
  orgId: string;
  role: OrgRole;
};

export async function getAdminActor(): Promise<AdminActor | null> {
  const session = await auth();
  if (
    !session?.user?.id ||
    !session.user.orgId ||
    !session.user.role ||
    !sessionIsOrgAdmin(session)
  ) {
    return null;
  }

  return {
    userId: session.user.id,
    orgId: session.user.orgId,
    role: session.user.role,
  };
}
