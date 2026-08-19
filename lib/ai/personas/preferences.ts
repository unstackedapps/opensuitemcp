/** Client-safe persona prefs (no Node fs). */

export const HIDE_PERSONA_PICKER_COOKIE = "hide-persona-picker";
export const DEFAULT_PERSONA_ID_COOKIE = "default-persona-id";

const BUILTIN_IDS = new Set([
  "ava",
  "netsuite-administrator",
  "suiteql-data-analyst",
  "financial-controller",
  "suitescript-developer",
  "netsuite-auditor",
  "inventory-supply-chain-analyst",
]);

export function parseHidePersonaPickerCookie(
  value: string | undefined,
): boolean {
  return value === "1" || value === "true";
}

/** Guest DNSA default must be a builtin id (including ava). */
export function parseDefaultPersonaIdCookie(value: string | undefined): string {
  if (!value?.trim()) {
    return "ava";
  }
  const id = value.trim();
  if (BUILTIN_IDS.has(id)) {
    return id;
  }
  return "ava";
}

/** Persist guest hide/default without a full page refresh. */
export function persistGuestPersonaPreferences(input: {
  hidePersonaPicker?: boolean;
  defaultPersonaId?: string;
}) {
  void fetch("/api/chat/persona-prefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function sessionPersonaKey(chatId: string): string {
  return `persona:${chatId}`;
}

export function readSessionPersonaId(chatId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return sessionStorage.getItem(sessionPersonaKey(chatId));
  } catch {
    return null;
  }
}

export function writeSessionPersonaId(chatId: string, personaId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(sessionPersonaKey(chatId), personaId);
  } catch {
    // ignore quota / private mode
  }
}
