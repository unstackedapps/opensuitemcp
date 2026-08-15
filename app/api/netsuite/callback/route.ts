import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserSettings } from "@/lib/db/queries";
import { publicAppUrl } from "@/lib/http/public-origin";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { callbackSchema, exchangeCodeForToken } from "@/lib/netsuite/oauth";
import { saveNetSuiteToken } from "@/lib/netsuite/tokens";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      publicAppUrl(
        `/?error=netsuite_auth_failed&error_description=${encodeURIComponent(error)}`,
        request,
      ),
    );
  }

  // Validate callback parameters
  const validation = callbackSchema.safeParse({ code, state });

  if (!validation.success || !code || !state) {
    return NextResponse.redirect(
      publicAppUrl("/?error=invalid_callback", request),
    );
  }

  // Get stored values from cookies
  const cookieStore = await cookies();
  const storedCodeVerifier = cookieStore.get("netsuite_code_verifier")?.value;
  const storedState = cookieStore.get("netsuite_state")?.value;
  const userId = cookieStore.get("netsuite_user_id")?.value;
  const storedAccountId = cookieStore.get("netsuite_account_id")?.value;

  // Validate state to prevent CSRF attacks
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      publicAppUrl("/?error=state_mismatch", request),
    );
  }

  if (!storedCodeVerifier || !userId) {
    return NextResponse.redirect(
      publicAppUrl("/?error=missing_session_data", request),
    );
  }

  try {
    // Exchange authorization code for tokens
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

    cookieStore.delete("netsuite_code_verifier");
    cookieStore.delete("netsuite_state");
    cookieStore.delete("netsuite_user_id");
    cookieStore.delete("netsuite_account_id");

    return NextResponse.redirect(
      publicAppUrl("/?netsuite_connected=true", request),
    );
  } catch (tokenError) {
    const errorMessage =
      tokenError instanceof Error ? tokenError.message : "Unknown error";
    return NextResponse.redirect(
      publicAppUrl(
        `/?error=netsuite_token_exchange_failed&error_description=${encodeURIComponent(errorMessage)}`,
        request,
      ),
    );
  }
}
