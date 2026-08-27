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
    "/((?!_next/static|_next/image|favicon.ico|icon.ico|icon.svg|icon|apple-icon|sitemap.xml|robots.txt).*)",
  ],
};
