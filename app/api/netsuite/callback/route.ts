import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserSettings } from "@/lib/db/queries";
import { publicAppUrl, sanitizeReturnTo } from "@/lib/http/public-origin";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { invalidateMcpToolsListCache } from "@/lib/netsuite/mcp";
import { callbackSchema, exchangeCodeForToken } from "@/lib/netsuite/oauth";
import { saveNetSuiteToken } from "@/lib/netsuite/tokens";

function oauthErrorRedirect(
  request: Request,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  error: string,
  errorDescription?: string,
): NextResponse {
  const returnPath = cookieStore.get("netsuite_return_path")?.value;
  const basePath = sanitizeReturnTo(returnPath);
  const separator = basePath.includes("?") ? "&" : "?";
  const description = errorDescription?.trim();
  const query = description
    ? `error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(description)}`
    : `error=${encodeURIComponent(error)}`;

  cookieStore.delete("netsuite_code_verifier");
  cookieStore.delete("netsuite_state");
  cookieStore.delete("netsuite_user_id");
  cookieStore.delete("netsuite_account_id");
  cookieStore.delete("netsuite_return_path");

  return NextResponse.redirect(
    publicAppUrl(`${basePath}${separator}${query}`, request),
  );
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return oauthErrorRedirect(
      request,
      cookieStore,
      "netsuite_auth_failed",
      error,
    );
  }

  const validation = callbackSchema.safeParse({ code, state });

  if (!validation.success || !code || !state) {
    return oauthErrorRedirect(request, cookieStore, "invalid_callback");
  }

  const storedCodeVerifier = cookieStore.get("netsuite_code_verifier")?.value;
  const storedState = cookieStore.get("netsuite_state")?.value;
  const userId = cookieStore.get("netsuite_user_id")?.value;
  const storedAccountId = cookieStore.get("netsuite_account_id")?.value;

  if (!storedState || storedState !== state) {
    return oauthErrorRedirect(request, cookieStore, "state_mismatch");
  }

  if (!storedCodeVerifier || !userId) {
    return oauthErrorRedirect(request, cookieStore, "missing_session_data");
  }

  try {
    const tokenResponse = await exchangeCodeForToken({
      userId,
      accountId: storedAccountId,
      code,
      codeVerifier: storedCodeVerifier,
      state,
    });

    const settings = await getUserSettings({ userId });
    const accountId = storedAccountId?.trim()
      ? normalizeNetSuiteAccountId(storedAccountId)
      : (settings?.netsuiteAccountId ?? null);
    await saveNetSuiteToken({
      userId,
      accountId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
    });
    invalidateMcpToolsListCache(userId, accountId);

    const returnPath = cookieStore.get("netsuite_return_path")?.value;
    cookieStore.delete("netsuite_return_path");

    try {
      const { getUserOrgContext } = await import("@/lib/org/queries");
      const { markOrgNetSuiteMcpAccountConnectedFromOAuth } = await import(
        "@/lib/org/admin/netsuite-mcp-verify"
      );
      const orgContext = await getUserOrgContext(userId);
      if (
        orgContext &&
        (orgContext.role === "owner" || orgContext.role === "admin") &&
        accountId
      ) {
        await markOrgNetSuiteMcpAccountConnectedFromOAuth({
          orgId: orgContext.orgId,
          accountId,
          actorUserId: userId,
        });
      }
    } catch (markError) {
      console.error("[NetSuite Callback] Org MCP mark connected:", markError);
    }

    const successPath = sanitizeReturnTo(returnPath);
    const successUrl = successPath.includes("netsuite_connected=true")
      ? successPath
      : successPath.includes("?")
        ? `${successPath}&netsuite_connected=true`
        : `${successPath}?netsuite_connected=true`;

    cookieStore.delete("netsuite_code_verifier");
    cookieStore.delete("netsuite_state");
    cookieStore.delete("netsuite_user_id");
    cookieStore.delete("netsuite_account_id");

    return NextResponse.redirect(publicAppUrl(successUrl, request));
  } catch (tokenError) {
    const errorMessage =
      tokenError instanceof Error ? tokenError.message : "Unknown error";
    return oauthErrorRedirect(
      request,
      cookieStore,
      "netsuite_token_exchange_failed",
      errorMessage,
    );
  }
}
