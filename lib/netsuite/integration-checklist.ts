import {
  getNetSuiteRedirectUri,
  NETSUITE_DCR_CLIENT_NAME,
} from "@/lib/netsuite/accounts";

export type IntegrationChecklistField = {
  id: string;
  label: string;
  value: string;
  /** When true, UI should offer a copy control */
  copyable?: boolean;
};

export type IntegrationChecklistStep = {
  id: string;
  title: string;
  body?: string;
  fields?: IntegrationChecklistField[];
};

/**
 * Shared Integration setup steps for the public docs and App Portal.
 * Pass redirectUri from probe when available; otherwise uses env-based callback.
 */
export function getIntegrationSetupSteps(options?: {
  redirectUri?: string;
  clientName?: string;
}): IntegrationChecklistStep[] {
  const clientName = options?.clientName?.trim() || NETSUITE_DCR_CLIENT_NAME;
  const redirectUri = options?.redirectUri?.trim() || getNetSuiteRedirectUri();

  return [
    {
      id: "open-form",
      title: "Open New Integration in NetSuite",
      body: "As a NetSuite administrator, go to Setup > Integration > Manage Integrations > New. Non-admins should send this checklist to their admin team.",
    },
    {
      id: "fields",
      title: "Set these field values",
      fields: [
        {
          id: "name",
          label: "Name",
          value: clientName,
          copyable: true,
        },
        {
          id: "auth-code",
          label: "Authorization Code Grant",
          value: "checked",
        },
        {
          id: "public-client",
          label: "Public Client",
          value: "checked",
        },
        {
          id: "redirect-uri",
          label: "Redirect URI",
          value: redirectUri,
          copyable: true,
        },
        {
          id: "scope",
          label: "Scope",
          value: "NetSuite AI Connector Service (leave other scopes off)",
        },
        {
          id: "dcr",
          label: "Dynamic Client Registration",
          value: "checked",
        },
        {
          id: "dcr-name",
          label: "Dynamic Client Registration Client Name",
          value: clientName,
          copyable: true,
        },
      ],
    },
    {
      id: "save",
      title: "Save and return",
      body: "Press Save in NetSuite, then return to OpenSuiteMCP and choose Check again, then Connect.",
    },
  ];
}

/** Compact string list for API probe/connect responses. */
export function getNetSuiteIntegrationChecklist(
  redirectUri?: string,
): string[] {
  const steps = getIntegrationSetupSteps({ redirectUri });
  const fields = steps.find((step) => step.id === "fields")?.fields ?? [];
  return fields.map((field) => `${field.label} — ${field.value}`);
}

export const ORACLE_DOC_LINKS = {
  aiConnector:
    "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7200233106.html",
  mcpStandardTools:
    "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_0902023450.html",
  companion:
    "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_9091153093.html",
  companionSuiteApp:
    "https://system.netsuite.com/suiteapp/ui/marketplace.nl?#/app?id=com.suitesuccess.nsaicompanion",
  agentSkills:
    "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_7122549123.html",
} as const;
