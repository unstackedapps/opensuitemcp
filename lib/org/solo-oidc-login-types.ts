export type SoloOidcLoginAccount = {
  id: string;
  accountId: string;
  name: string;
  clientIdPreview: string | null;
  enabled: boolean;
  linkedLoginEmail: string | null;
  verifiedAt: string | null;
};

export type SoloOidcLoginSettings = {
  redirectUri: string;
  setupHint: string;
  source: "db" | "env" | "none";
  envAccountId: string | null;
  accounts: SoloOidcLoginAccount[];
};
