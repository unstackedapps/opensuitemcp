import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  buildAuthorizationUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "@/lib/netsuite/oauth";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Store code verifier and state in secure cookies (will be used in callback)
  const cookieStore = await cookies();
  cookieStore.set("netsuite_code_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
  });

  cookieStore.set("netsuite_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
  });

  cookieStore.set("netsuite_user_id", session.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
  });

  // Build and redirect to authorization URL
  const authUrl = await buildAuthorizationUrl({
    userId: session.user.id,
    codeChallenge,
    state,
  });

  return NextResponse.redirect(authUrl);
}
