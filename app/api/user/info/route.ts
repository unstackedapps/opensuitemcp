import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { listOidcConnectionLinksForUser } from "@/lib/auth/user-oidc-connection-links";
import { listUserOidcLoginEmails } from "@/lib/auth/user-oidc-login-emails";
import { getUserById } from "@/lib/db/queries";
import { isSoloInstallMode } from "@/lib/org/install-config";
import {
  listLoginOidcOptions,
  listUserOidcAccountIds,
} from "@/lib/org/oidc-accounts";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getUserById(session.user.id);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [oidcOptions, oidcAccountIds, oidcLoginEmails, oidcConnectionLinks] =
      await Promise.all([
        listLoginOidcOptions(),
        listUserOidcAccountIds(session.user.id),
        isSoloInstallMode()
          ? listUserOidcLoginEmails(session.user.id)
          : Promise.resolve([]),
        isSoloInstallMode()
          ? listOidcConnectionLinksForUser(session.user.id)
          : Promise.resolve([]),
      ]);

    const hasOidcAccess = oidcAccountIds.length > 0;
    const oidcEmailLinked =
      oidcLoginEmails.length > 0 || oidcConnectionLinks.length > 0;

    return NextResponse.json({
      id: user.id,
      email: user.email,
      lastLoginAt: user.lastLoginAt,
      hasPassword: Boolean(user.password),
      mustResetPassword: user.mustResetPassword,
      isSoloInstall: isSoloInstallMode(),
      signInMethods: {
        password: Boolean(user.password),
        oidcConfigured: oidcOptions.length > 0,
        hasOidcAccess,
        oidcEmailLinked,
        oidcLoginEmails: [
          ...new Set([
            ...oidcLoginEmails,
            ...oidcConnectionLinks.map((link) => link.email),
          ]),
        ],
        oidcLinked: hasOidcAccess,
      },
    });
  } catch (error) {
    console.error("[User Info] Error fetching user info:", error);
    return NextResponse.json(
      { error: "Failed to fetch user info" },
      { status: 500 },
    );
  }
}
