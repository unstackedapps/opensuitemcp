import { ChatSDKError } from "@/lib/errors";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

export function adminActionUnauthorized(): AdminActionResult {
  return { ok: false, error: "Unauthorized." };
}

export function adminActionFailed(error: unknown): AdminActionResult {
  if (error instanceof ChatSDKError) {
    const message =
      typeof error.cause === "string" ? error.cause : error.message;
    return { ok: false, error: message };
  }
  if (error instanceof Error && error.message) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Request failed." };
}

export function adminActionError(error: unknown): { ok: false; error: string } {
  const result = adminActionFailed(error);
  if (result.ok) {
    return { ok: false, error: "Request failed." };
  }
  return result;
}
