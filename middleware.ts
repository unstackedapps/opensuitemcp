import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  getUnauthenticatedRedirectPath,
  isGuestAuthEnabled,
  isOrgInstallMode,
  isUnauthenticatedPublicPath,
} from "@/lib/auth/guest-policy";
import {
  guestRegex,
  isDevelopmentEnvironment,
  PUBLIC_DOCS_ORIGIN,
} from "./lib/constants";

function isDocsPath(pathname: string): boolean {
  return pathname === "/docs" || pathname.startsWith("/docs/");
}

/**
 * The MCP server and its authorization server authenticate in their own route
 * handlers — a bearer credential, or a client id and secret. They must bypass
 * the cookie gate below, or a client handshake is answered with a redirect to
 * /login instead of a protocol response.
 *
 * `/oauth/authorize` is deliberately *not* here. It is the one OAuth surface a
 * person uses directly, and it needs the gate: an unauthenticated visitor
 * should be bounced to login and returned to the consent screen afterwards.
 */
function isMcpServerPath(pathname: string): boolean {
  return (
    pathname === "/api/mcp" ||
    pathname.startsWith("/api/mcp/") ||
    pathname.startsWith("/api/oauth/") ||
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname.startsWith("/.well-known/oauth-protected-resource/") ||
    pathname === "/.well-known/oauth-authorization-server" ||
    pathname.startsWith("/.well-known/oauth-authorization-server/") ||
    pathname === "/.well-known/openid-configuration"
  );
}

/** Next.js metadata routes must stay public so favicons load on /login and /setup. */
function isAppMetadataPath(pathname: string): boolean {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/icon" ||
    pathname === "/icon.svg" ||
    pathname.startsWith("/apple-icon") ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (isAppMetadataPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (isMcpServerPath(pathname)) {
    return NextResponse.next();
  }

  if (isDocsPath(pathname)) {
    const dest = new URL(pathname, PUBLIC_DOCS_ORIGIN);
    dest.search = request.nextUrl.search;
    return NextResponse.redirect(dest, 308);
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  if (!token) {
    if (pathname === "/register" && isOrgInstallMode()) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    if (isUnauthenticatedPublicPath(pathname)) {
      return NextResponse.next();
    }

    if (isGuestAuthEnabled()) {
      const redirectUrl = encodeURIComponent(request.url);
      return NextResponse.redirect(
        new URL(`/api/auth/guest?redirectUrl=${redirectUrl}`, request.url),
      );
    }

    const loginUrl = new URL(getUnauthenticatedRedirectPath(), request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (
    token &&
    isGuest &&
    !isGuestAuthEnabled() &&
    !isUnauthenticatedPublicPath(pathname)
  ) {
    return NextResponse.redirect(
      new URL(getUnauthenticatedRedirectPath(), request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",
    "/setup",
    "/onboarding",
    "/admin",
    "/admin/:path*",

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/.well-known/:path*",
    "/((?!_next/static|_next/image|favicon.ico|icon.ico|icon.svg|icon|apple-icon|sitemap.xml|robots.txt).*)",
  ],
};
