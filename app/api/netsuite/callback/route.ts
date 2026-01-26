import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callbackSchema, exchangeCodeForToken } from "@/lib/netsuite/oauth";
import { saveNetSuiteToken } from "@/lib/netsuite/tokens";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/?error=netsuite_auth_failed&error_description=${encodeURIComponent(error)}`,
        request.url,
      ),
    );
  }

  // Validate callback parameters
  const validation = callbackSchema.safeParse({ code, state });

  if (!validation.success || !code || !state) {
    return NextResponse.redirect(
      new URL("/?error=invalid_callback", request.url),
    );
  }

  // Get stored values from cookies
  const cookieStore = await cookies();
  const storedCodeVerifier = cookieStore.get("netsuite_code_verifier")?.value;
  const storedState = cookieStore.get("netsuite_state")?.value;
  const userId = cookieStore.get("netsuite_user_id")?.value;

  // Validate state to prevent CSRF attacks
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL("/?error=state_mismatch", request.url),
    );
  }

  if (!storedCodeVerifier || !userId) {
    return NextResponse.redirect(
      new URL("/?error=missing_session_data", request.url),
    );
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await exchangeCodeForToken({
      userId,
      code,
      codeVerifier: storedCodeVerifier,
      state,
    });

    // Save tokens to database
    await saveNetSuiteToken({
      userId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
    });

    // Clear cookies
    cookieStore.delete("netsuite_code_verifier");
    cookieStore.delete("netsuite_state");
    cookieStore.delete("netsuite_user_id");

    return NextResponse.redirect(
      new URL("/?netsuite_connected=true", request.url),
    );
  } catch (tokenError) {
    const errorMessage =
      tokenError instanceof Error ? tokenError.message : "Unknown error";
    return NextResponse.redirect(
      new URL(
        `/?error=netsuite_token_exchange_failed&error_description=${encodeURIComponent(errorMessage)}`,
        request.url,
      ),
    );
  }
}
