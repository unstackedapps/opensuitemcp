import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import {
  getUnauthenticatedRedirectPath,
  isGuestAuthEnabled,
} from "@/lib/auth/guest-policy";
import { isDevelopmentEnvironment } from "@/lib/constants";

export async function GET(request: Request) {
  if (!isGuestAuthEnabled()) {
    return NextResponse.redirect(
      new URL(getUnauthenticatedRedirectPath(), request.url),
    );
  }

  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get("redirectUrl") || "/";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  if (token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return signIn("guest", { redirect: true, redirectTo: redirectUrl });
}
