/** Client-safe persona ids and labels (no Node fs). */

export const AVA_PERSONA_ID = "ava";

/** System interview mode — not a NetSuite specialist playbook. */
export const PERSONA_BUILDER_ID = "persona-builder";

export const BUILTIN_PERSONA_IDS = [
  AVA_PERSONA_ID,
  "netsuite-administrator",
  "suiteql-data-analyst",
  "financial-controller",
  "suitescript-developer",
  "netsuite-auditor",
  "inventory-supply-chain-analyst",
] as const;

export const BUILTIN_PERSONA_SHORT_NAMES: Record<string, string> = {
  ava: "Ava",
  "netsuite-administrator": "Administrator",
  "suiteql-data-analyst": "SuiteQL Analyst",
  "financial-controller": "Controller",
  "suitescript-developer": "Developer",
  "netsuite-auditor": "Auditor",
  "inventory-supply-chain-analyst": "Supply Chain Analyst",
  [PERSONA_BUILDER_ID]: "Interview",
};

/** Builtin cards for the picker — always available on the client. */
export const CLIENT_BUILTIN_PERSONAS: Array<{
  id: string;
  name: string;
  shortName: string;
  primaryRole: string;
  source: "ava" | "builtin";
}> = [
  {
    id: AVA_PERSONA_ID,
    name: "Ava",
    shortName: "Ava",
    primaryRole: "OpenSuiteMCP's NetSuite assistant",
    source: "ava",
  },
  {
    id: "netsuite-administrator",
    name: "NetSuite Administrator",
    shortName: "Administrator",
    primaryRole:
      "NetSuite configuration, access, troubleshooting, and platform administration",
    source: "builtin",
  },
  {
    id: "suiteql-data-analyst",
    name: "SuiteQL Data Analyst",
    shortName: "SuiteQL Analyst",
    primaryRole:
      "Convert business questions into accurate, efficient NetSuite data analysis",
    source: "builtin",
  },
  {
    id: "financial-controller",
    name: "Financial Controller",
    shortName: "Controller",
    primaryRole:
      "NetSuite financial analysis, accounting review, close support, and variance investigation",
    source: "builtin",
  },
  {
    id: "suitescript-developer",
    name: "SuiteScript Developer",
    shortName: "Developer",
    primaryRole: "Design, debug, and implement NetSuite customizations",
    source: "builtin",
  },
  {
    id: "netsuite-auditor",
    name: "NetSuite Auditor",
    shortName: "Auditor",
    primaryRole:
      "Independent review of NetSuite controls, transactions, configuration, and exceptions",
    source: "builtin",
  },
  {
    id: "inventory-supply-chain-analyst",
    name: "Inventory & Supply Chain Analyst",
    shortName: "Supply Chain Analyst",
    primaryRole:
      "Inventory, purchasing, fulfillment, demand, and operational supply-chain analysis",
    source: "builtin",
  },
];

export function isBuiltinPersonaId(id: string): boolean {
  return (BUILTIN_PERSONA_IDS as readonly string[]).includes(id);
}

export function isPersonaBuilderId(id: string | null | undefined): boolean {
  return (id?.trim() || "") === PERSONA_BUILDER_ID;
}

export function clientPersonaShortName(
  personaId: string | null | undefined,
): string {
  const id = personaId?.trim() || AVA_PERSONA_ID;
  return BUILTIN_PERSONA_SHORT_NAMES[id] ?? "Persona";
}

/** Sidebar / badge label when custom short names are known client-side. */
export function clientPersonaShortNameWithCustoms(
  personaId: string | null | undefined,
  customs: Array<{ id: string; shortName?: string; name?: string }> = [],
): string {
  const id = personaId?.trim() || AVA_PERSONA_ID;
  const fromBuiltin = BUILTIN_PERSONA_SHORT_NAMES[id];
  if (fromBuiltin) {
    return fromBuiltin;
  }
  const custom = customs.find((p) => p.id === id);
  if (custom?.shortName?.trim()) {
    return custom.shortName.trim();
  }
  if (custom?.name?.trim()) {
    return custom.name.trim();
  }
  return "Persona";
}
