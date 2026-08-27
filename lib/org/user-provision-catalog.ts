export type UserProvisionCatalogValue = {
  value: string;
  label?: string;
};

export type UserProvisionCatalogColumn = {
  key: string;
  label: string;
  description: string;
  required?: boolean;
  example?: string;
  allowedValues?: UserProvisionCatalogValue[];
};

export const USER_PROVISION_IMPORT_COLUMNS: UserProvisionCatalogColumn[] = [
  {
    key: "email",
    label: "email",
    description: "User email address. Required on every row.",
    required: true,
    example: "jane@example.com",
  },
  {
    key: "name",
    label: "name",
    description: "Display name. Optional.",
    example: "Jane Doe",
  },
  {
    key: "role",
    label: "role",
    description: "Org role. Defaults to member when blank.",
    example: "member",
    allowedValues: [
      { value: "owner", label: "Owner" },
      { value: "admin", label: "Admin" },
      { value: "member", label: "Member" },
    ],
  },
  {
    key: "disabled",
    label: "disabled",
    description: "Whether the account is disabled.",
    example: "false",
    allowedValues: [
      { value: "false", label: "Active" },
      { value: "true", label: "Disabled" },
    ],
  },
  {
    key: "action",
    label: "action",
    description: "Create or update a user, or remove them from the org.",
    example: "upsert",
    allowedValues: [
      { value: "upsert", label: "Add or update user" },
      { value: "delete", label: "Remove user from org" },
    ],
  },
];
