/** OAuth callback / login errors where Basic Auth is a reasonable fallback. */
export const OIDC_TRY_BASIC_AUTH_ERRORS = new Set([
  "netsuite_auth_failed",
  "netsuite_token_exchange_failed",
  "sign_in_failed",
  "missing_login_proof",
  "state_mismatch",
  "missing_session_data",
]);

export const OIDC_BASIC_AUTH_FALLBACK_NOTE =
  "NetSuite OIDC sign-in did not complete. If OIDC is not enabled for your NetSuite user, or you use password login only, try Basic Auth instead.";

const SOLO_EXISTING_OWNER_NOTE =
  "This install already has an account with a different email. Sign in with Basic Auth, then link your NetSuite email under Settings → NetSuite → Sign in.";

function isSoloExistingOwnerError(
  error: string,
  description?: string | null,
): boolean {
  return (
    error === "user_not_provisioned" &&
    (description?.toLowerCase().includes("already has an account") ?? false)
  );
}

export function shouldOfferBasicAuthFallback(
  error: string | null | undefined,
  description?: string | null,
): boolean {
  if (!error) {
    return false;
  }
  if (isSoloExistingOwnerError(error, description)) {
    return true;
  }
  return OIDC_TRY_BASIC_AUTH_ERRORS.has(error);
}

export function getOidcBasicAuthFallbackNote(
  error: string | null | undefined,
  description?: string | null,
): string {
  if (error && isSoloExistingOwnerError(error, description)) {
    return SOLO_EXISTING_OWNER_NOTE;
  }
  return OIDC_BASIC_AUTH_FALLBACK_NOTE;
}

export function getNetSuiteAuthErrorMessage(
  error: string,
  description?: string | null,
): string {
  const normalizedDescription = description?.trim().toLowerCase() ?? "";

  if (
    error === "netsuite_auth_failed" &&
    (normalizedDescription === "access_denied" ||
      normalizedDescription.includes("access denied"))
  ) {
    return "NetSuite denied OIDC sign-in. Your user may be configured for password login only — try Basic Auth instead.";
  }

  const staticMessages: Record<string, string> = {
    bootstrap_not_configured:
      "Set OSMCP_ROOT_EMAIL before completing organization setup.",
    root_email_mismatch:
      "This NetSuite user is not authorized to become org owner.",
    netsuite_login_not_configured:
      "NetSuite login is not configured. Enter OIDC details on /setup or set OSMCP_NS_ACCOUNT_ID and OSMCP_NS_OIDC_CLIENT_ID.",
    user_not_provisioned:
      "No app account exists for this NetSuite user. Contact your administrator for access.",
    oidc_access_denied:
      "You are not authorized to sign in with this NetSuite account.",
    missing_account_id: "Select a NetSuite account to sign in with.",
    user_disabled: "This account has been disabled.",
    setup_required: "Complete organization setup before signing in.",
    netsuite_auth_failed:
      "NetSuite OIDC sign-in was cancelled or failed. If your user uses password login only, try Basic Auth instead.",
    state_mismatch: "NetSuite sign-in session expired. Try again.",
    missing_session_data: "NetSuite sign-in session expired. Try again.",
    netsuite_token_exchange_failed:
      "NetSuite OIDC sign-in failed. Confirm the account and OIDC integration, or try Basic Auth if your user is password-only.",
    missing_login_proof: "NetSuite sign-in could not be completed. Try again.",
    sign_in_failed:
      "NetSuite sign-in could not be completed. Try Basic Auth if OIDC is not enabled for your user.",
    invalid_data: "Check your NetSuite account ID and OIDC client ID.",
    oidc_setup_locked:
      "NetSuite sign-in is already configured, or this personal install already has an owner. Add OIDC from Settings after you sign in.",
  };

  if (description?.trim()) {
    return description.trim();
  }

  return staticMessages[error] ?? "NetSuite sign-in failed. Try again.";
}
