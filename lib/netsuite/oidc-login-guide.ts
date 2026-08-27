export const NETSUITE_OIDC_LOGIN_REDIRECT_PATH = "/api/auth/netsuite/callback";

export const NETSUITE_OIDC_LOGIN_INTEGRATION_NAME = "OpenSuiteMCP Login OIDC";

export type NetSuiteOidcLoginGuideDetail =
  | { text: string }
  | { redirectUri: true };

export type NetSuiteOidcLoginGuideStep = {
  text: string;
  details?: NetSuiteOidcLoginGuideDetail[];
};

/** NetSuite admin steps for app sign-in (not MCP connect). */
export const NETSUITE_OIDC_LOGIN_STEPS: NetSuiteOidcLoginGuideStep[] = [
  { text: "Setup → Company → Enable Features" },
  {
    text: "Open the SuiteCloud tab. Check NetSuite as OIDC Provider and Save.",
  },
  { text: "Setup → Integration → Manage Integrations → New" },
  {
    text: "Fill in the integration:",
    details: [
      { text: `Name: ${NETSUITE_OIDC_LOGIN_INTEGRATION_NAME}` },
      { text: "State: Enabled" },
      { text: "Authorization Code Grant: checked" },
      { text: "Public Client: checked" },
      { redirectUri: true },
      { text: "No scopes checked" },
      { text: "No token-based authentication types checked" },
    ],
  },
  { text: "Save the record. Copy the Client ID shown after save." },
  { text: "Setup → Integration → NetSuite as OIDC Provider Setup" },
  { text: "Find the integration you just created." },
  {
    text: "Set access options for allowed entities and roles. This is who can sign in with this app.",
  },
  { text: "Save." },
  {
    text: "Use the account ID from the NetSuite URL (for example 1234567 or 1234567-sb1) and the Client ID from the integration in the form.",
  },
];
