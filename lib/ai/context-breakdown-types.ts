export type ContextBreakdownId =
  | "system"
  | "persona"
  | "skills"
  | "knowledge"
  | "tools"
  | "conversation";

export type ContextBreakdownPart = {
  id: ContextBreakdownId;
  label: string;
  tokens: number;
};

export type ContextBreakdownPartsInput = {
  system?: string;
  persona?: string;
  skills?: string;
  knowledge?: string;
  tools?: string;
  /** Serialized chat messages (roles + content) for relative weight. */
  conversation?: string;
};
