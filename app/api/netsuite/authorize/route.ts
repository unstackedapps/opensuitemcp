import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
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

  const settings = await getUserSettings({ userId: session.user.id });
  const accountId = settings?.netsuiteAccountId
    ? normalizeNetSuiteAccountId(settings.netsuiteAccountId)
    : null;
  if (!accountId) {
    return NextResponse.json(
      { error: "Select a NetSuite account before connecting." },
      { status: 400 },
    );
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600,
  };
  cookieStore.set("netsuite_code_verifier", codeVerifier, cookieOptions);
  cookieStore.set("netsuite_state", state, cookieOptions);
  cookieStore.set("netsuite_user_id", session.user.id, cookieOptions);
  cookieStore.set("netsuite_account_id", accountId, cookieOptions);

  const authUrl = await buildAuthorizationUrl({
    userId: session.user.id,
    accountId,
    codeChallenge,
    state,
  });

  return NextResponse.redirect(authUrl);
}
