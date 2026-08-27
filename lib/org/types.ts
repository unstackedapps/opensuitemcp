import type { OrgRole } from "@/lib/db/schema";

export type { OrgRole } from "@/lib/db/schema";

export const ORG_ROLES: OrgRole[] = ["owner", "admin", "member"];

export const DEFAULT_ORG_NAME = "Default Organization";

export const DEFAULT_OWNER_NAME = "root";

export type UserOrgContext = {
  orgId: string;
  role: OrgRole;
};

export function isOrgAdminRole(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function isOrgOwnerRole(role: OrgRole | null | undefined): boolean {
  return role === "owner";
}
