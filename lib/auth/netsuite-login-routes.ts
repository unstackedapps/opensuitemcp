import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth, signIn, signOut } from "@/app/(auth)/auth";
import {
  type NetSuiteLoginIntent,
  resolveNetSuiteLoginUser,
} from "@/lib/auth/netsuite-login";
import { createNetSuiteLoginProof } from "@/lib/auth/netsuite-login-proof";
import { upsertOidcConnectionLink } from "@/lib/auth/user-oidc-connection-links";
import { linkUserOidcLoginEmail } from "@/lib/auth/user-oidc-login-emails";
import { guestRegex } from "@/lib/constants";
import { publicAppUrl, sanitizeReturnTo } from "@/lib/http/public-origin";
import { normalizeNetSuiteAccountId } from "@/lib/netsuite/accounts";
import { buildNetSuiteAuthorizationUrl } from "@/lib/netsuite/oauth/authorization";
import {
  getOAuthCookieOptions,
  NETSUITE_LOGIN_COOKIE,
} from "@/lib/netsuite/oauth/cookies";
import { verifyNetSuiteIdToken } from "@/lib/netsuite/oauth/id-token";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthSecret,
} from "@/lib/netsuite/oauth/pkce";
import { exchangeNetSuiteAuthorizationCode } from "@/lib/netsuite/oauth/token";
import {
  getBootstrapConfigError,
  isOrgBootstrapConfigured,
} from "@/lib/org/bootstrap-config";
import { isSoloInstallMode } from "@/lib/org/install-config";
import {
  getOrgOidcLoginConfig,
  markOrgOidcAccountVerifiedFromTest,
} from "@/lib/org/oidc-accounts";
import { needsOrgSetup } from "@/lib/org/setup";

function redirectWithError(
  request: Request,
  path: string,
  code: string,
  description?: string,
): NextResponse {
  const url = publicAppUrl(path, request);
  url.searchParams.set("error", code);
  if (description) {
    url.searchParams.set("error_description", description);
  }
  return NextResponse.redirect(url);
}

function clearLoginOAuthCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
  for (const name of Object.values(NETSUITE_LOGIN_COOKIE)) {
    cookieStore.delete(name);
  }
}

function isGuestSession(session: Session | null): boolean {
  if (!session?.user) {
    return false;
  }
  if (session.user.type === "guest") {
    return true;
  }
  return guestRegex.test(session.user.email ?? "");
}

function parseLoginIntent(intentParam: string | null): NetSuiteLoginIntent {
  if (intentParam === "bootstrap") {
    return "bootstrap";
  }
  if (intentParam === "test") {
    return "test";
  }
  return "login";
}

function defaultReturnTo(intent: NetSuiteLoginIntent): string {
  if (intent === "bootstrap") {
    return "/admin/users";
  }
  if (intent === "test") {
    return "/admin/netsuite/oidc";
  }
  return "/";
}

function errorPathForIntent(
  intent: NetSuiteLoginIntent,
  returnTo: string,
): string {
  if (intent === "bootstrap") {
    return "/setup";
  }
  if (intent === "test") {
    return returnTo;
  }
  return "/login";
}

function withNetsuiteConnected(path: string): string {
  if (path.includes("netsuite_connected=true")) {
    return path;
  }
  return path.includes("?")
    ? `${path}&netsuite_connected=true`
    : `${path}?netsuite_connected=true`;
}

function appendSearchParam(path: string, key: string, value: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.set(key, value);
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const intent = parseLoginIntent(searchParams.get("intent"));
  const returnTo = sanitizeReturnTo(
    searchParams.get("returnTo"),
    defaultReturnTo(intent),
  );
  const errorPath = errorPathForIntent(intent, returnTo);

  const accountIdParam = searchParams.get("accountId");
  if (!accountIdParam?.trim()) {
    return redirectWithError(
      request,
      errorPath,
      "missing_account_id",
      "Select a NetSuite account to sign in with.",
    );
  }

  const normalizedAccountId = normalizeNetSuiteAccountId(accountIdParam);
  const config = await getOrgOidcLoginConfig(normalizedAccountId);
  if (!config) {
    return redirectWithError(
      request,
      errorPath,
      "netsuite_login_not_configured",
      "This NetSuite OIDC integration is not configured or is disabled.",
    );
  }

  if (intent === "bootstrap") {
    if (!(await needsOrgSetup())) {
      return NextResponse.redirect(publicAppUrl("/", request));
    }
    if (!isOrgBootstrapConfigured()) {
      return redirectWithError(
        request,
        "/setup",
        "bootstrap_not_configured",
        getBootstrapConfigError() ?? undefined,
      );
    }
  } else if (await needsOrgSetup()) {
    return NextResponse.redirect(publicAppUrl("/setup", request));
  }

  const session = await auth();
  if (session?.user?.id && intent === "login" && !isGuestSession(session)) {
    return NextResponse.redirect(publicAppUrl(returnTo, request));
  }

  if (isGuestSession(session)) {
    await signOut({ redirect: false });
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateOAuthSecret();
  const nonce = generateOAuthSecret();
  const cookieStore = await cookies();
  const cookieOptions = getOAuthCookieOptions();

  cookieStore.set(
    NETSUITE_LOGIN_COOKIE.codeVerifier,
    codeVerifier,
    cookieOptions,
  );
  cookieStore.set(NETSUITE_LOGIN_COOKIE.state, state, cookieOptions);
  cookieStore.set(NETSUITE_LOGIN_COOKIE.nonce, nonce, cookieOptions);
  cookieStore.set(NETSUITE_LOGIN_COOKIE.intent, intent, cookieOptions);
  cookieStore.set(NETSUITE_LOGIN_COOKIE.returnTo, returnTo, cookieOptions);
  cookieStore.set(
    NETSUITE_LOGIN_COOKIE.accountId,
    normalizedAccountId,
    cookieOptions,
  );

  const authUrl = buildNetSuiteAuthorizationUrl({
    accountId: config.accountId,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scope: "openid email",
    codeChallenge,
    state,
    nonce,
    prompt: "login",
  });

  return NextResponse.redirect(authUrl);
}

export async function handleNetSuiteLoginCallback(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get(NETSUITE_LOGIN_COOKIE.state)?.value;
  const storedVerifier = cookieStore.get(
    NETSUITE_LOGIN_COOKIE.codeVerifier,
  )?.value;
  const storedNonce = cookieStore.get(NETSUITE_LOGIN_COOKIE.nonce)?.value;
  const intent = cookieStore.get(NETSUITE_LOGIN_COOKIE.intent)?.value as
    | NetSuiteLoginIntent
    | undefined;
  const storedAccountId = cookieStore.get(
    NETSUITE_LOGIN_COOKIE.accountId,
  )?.value;
  const returnTo = sanitizeReturnTo(
    cookieStore.get(NETSUITE_LOGIN_COOKIE.returnTo)?.value ?? null,
    intent ? defaultReturnTo(intent) : "/",
  );
  const errorPath = intent ? errorPathForIntent(intent, returnTo) : "/login";

  if (error) {
    clearLoginOAuthCookies(cookieStore);
    return redirectWithError(request, errorPath, "netsuite_auth_failed", error);
  }

  if (!code || !state || !storedState || storedState !== state) {
    clearLoginOAuthCookies(cookieStore);
    return redirectWithError(request, errorPath, "state_mismatch");
  }

  if (!storedVerifier || !intent || !storedAccountId) {
    clearLoginOAuthCookies(cookieStore);
    return redirectWithError(request, errorPath, "missing_session_data");
  }

  const normalizedAccountId = normalizeNetSuiteAccountId(storedAccountId);
  const config = await getOrgOidcLoginConfig(normalizedAccountId);
  if (!config) {
    clearLoginOAuthCookies(cookieStore);
    return redirectWithError(
      request,
      errorPath,
      "netsuite_login_not_configured",
    );
  }

  try {
    const tokenResponse = await exchangeNetSuiteAuthorizationCode({
      accountId: config.accountId,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      code,
      codeVerifier: storedVerifier,
    });

    if (!tokenResponse.id_token) {
      throw new Error("NetSuite login response is missing id_token");
    }

    const identity = await verifyNetSuiteIdToken({
      accountId: config.accountId,
      clientId: config.clientId,
      idToken: tokenResponse.id_token,
      nonce: storedNonce,
    });

    if (intent === "test") {
      const session = await auth();
      let linkedEmail: string | null = null;

      if (
        session?.user?.id &&
        !isGuestSession(session) &&
        isSoloInstallMode()
      ) {
        try {
          const linkResult = await linkUserOidcLoginEmail({
            userId: session.user.id,
            email: identity.email,
          });
          if (config.orgOidcAccountId) {
            await upsertOidcConnectionLink({
              userId: session.user.id,
              orgOidcAccountId: config.orgOidcAccountId,
              email: identity.email,
            });
          }
          linkedEmail = linkResult.email;
        } catch (linkError) {
          clearLoginOAuthCookies(cookieStore);
          const message =
            linkError instanceof Error
              ? linkError.message
              : "Failed to link NetSuite email.";
          return redirectWithError(
            request,
            returnTo,
            "oidc_email_link_failed",
            message,
          );
        }
      } else if (!isSoloInstallMode() && config.orgOidcAccountId) {
        await markOrgOidcAccountVerifiedFromTest(config.orgOidcAccountId);
      }

      clearLoginOAuthCookies(cookieStore);
      let successPath = withNetsuiteConnected(returnTo);
      if (linkedEmail) {
        successPath = appendSearchParam(
          successPath,
          "oidc_email_linked",
          linkedEmail,
        );
      }
      return NextResponse.redirect(publicAppUrl(successPath, request));
    }

    const loginResult = await resolveNetSuiteLoginUser({
      email: identity.email,
      intent,
      orgOidcAccountId: config.orgOidcAccountId,
    });

    clearLoginOAuthCookies(cookieStore);

    if (!loginResult.ok) {
      return redirectWithError(
        request,
        errorPath,
        loginResult.code,
        loginResult.error,
      );
    }

    const proof = createNetSuiteLoginProof(
      loginResult.userId,
      loginResult.email,
    );
    cookieStore.set(
      NETSUITE_LOGIN_COOKIE.proof,
      proof,
      getOAuthCookieOptions(60),
    );

    const completeUrl = publicAppUrl("/api/auth/netsuite/complete", request);
    completeUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(completeUrl);
  } catch (callbackError) {
    clearLoginOAuthCookies(cookieStore);
    const message =
      callbackError instanceof Error ? callbackError.message : "Unknown error";
    return redirectWithError(
      request,
      errorPath,
      "netsuite_token_exchange_failed",
      message,
    );
  }
}

export async function completeNetSuiteLogin(
  request: Request,
): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"), "/");
  const cookieStore = await cookies();
  const proof = cookieStore.get(NETSUITE_LOGIN_COOKIE.proof)?.value;
  cookieStore.delete(NETSUITE_LOGIN_COOKIE.proof);

  if (!proof) {
    return NextResponse.redirect(
      publicAppUrl("/login?error=missing_login_proof", request),
    );
  }

  try {
    await signIn("netsuite-oauth", {
      proof,
      redirect: false,
    });
  } catch {
    return NextResponse.redirect(
      publicAppUrl("/login?error=sign_in_failed", request),
    );
  }

  return NextResponse.redirect(publicAppUrl(returnTo, request));
}
