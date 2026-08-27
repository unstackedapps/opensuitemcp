import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import { isSafeAppPath } from "@/lib/http/public-origin";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import {
  buildAuthorizationUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "@/lib/netsuite/oauth";
import { assertOrgNetSuiteMcpConnectAllowed } from "@/lib/org/enforcement";
import { isOrgInstallMode } from "@/lib/org/install-config";

export async function GET(request: Request) {
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
      { error: "Select a NetSuite connection before connecting." },
      { status: 400 },
    );
  }

  if (isOrgInstallMode() && session.user.orgId) {
    try {
      await assertOrgNetSuiteMcpConnectAllowed({
        orgId: session.user.orgId,
        userId: session.user.id,
        accountId,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "NetSuite connection not allowed.",
        },
        { status: 403 },
      );
    }
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

  const returnTo = new URL(request.url).searchParams.get("returnTo");
  if (isSafeAppPath(returnTo)) {
    cookieStore.set("netsuite_return_path", returnTo, cookieOptions);
  }

  const authUrl = await buildAuthorizationUrl({
    userId: session.user.id,
    accountId,
    codeChallenge,
    state,
  });

  return NextResponse.redirect(authUrl);
}
