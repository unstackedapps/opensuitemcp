import "server-only";

import { resolveUserForOidcLoginEmail } from "@/lib/auth/user-oidc-login-emails";
import {
  countNonGuestUsers,
  createOAuthUser,
  getUserById,
  updateUserLastLogin,
} from "@/lib/db/queries";
import {
  getBootstrapConfigError,
  isBootstrapEmailAllowed,
  isOrgBootstrapConfigured,
} from "@/lib/org/bootstrap-config";
import { createOwnerFromOAuth } from "@/lib/org/bootstrap-owner";
import { isSoloInstallMode } from "@/lib/org/install-config";
import {
  grantUserOidcAccess,
  userHasOidcAccess,
} from "@/lib/org/oidc-accounts";
import { needsOrgSetup } from "@/lib/org/setup";

export type NetSuiteLoginIntent = "login" | "bootstrap" | "test";

export type NetSuiteLoginResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string; code: string };

export async function resolveNetSuiteLoginUser(params: {
  email: string;
  intent: NetSuiteLoginIntent;
  orgOidcAccountId: string | null;
}): Promise<NetSuiteLoginResult> {
  const normalizedEmail = params.email.trim().toLowerCase();

  if (params.intent === "bootstrap") {
    if (!(await needsOrgSetup())) {
      return {
        ok: false,
        code: "already_configured",
        error: "Organization setup is already complete.",
      };
    }

    if (!isOrgBootstrapConfigured()) {
      return {
        ok: false,
        code: "bootstrap_not_configured",
        error:
          getBootstrapConfigError() ??
          "Bootstrap owner email is not configured.",
      };
    }

    if (!isBootstrapEmailAllowed(normalizedEmail)) {
      return {
        ok: false,
        code: "root_email_mismatch",
        error:
          "This NetSuite account is not authorized for org owner bootstrap.",
      };
    }

    const user = await createOwnerFromOAuth(normalizedEmail);
    if (params.orgOidcAccountId) {
      await grantUserOidcAccess({
        userId: user.id,
        orgOidcAccountId: params.orgOidcAccountId,
      });
    }
    await updateUserLastLogin(user.id);
    return { ok: true, userId: user.id, email: normalizedEmail };
  }

  if (await needsOrgSetup()) {
    if (
      isOrgBootstrapConfigured() &&
      isBootstrapEmailAllowed(normalizedEmail)
    ) {
      const user = await createOwnerFromOAuth(normalizedEmail);
      if (params.orgOidcAccountId) {
        await grantUserOidcAccess({
          userId: user.id,
          orgOidcAccountId: params.orgOidcAccountId,
        });
      }
      await updateUserLastLogin(user.id);
      return { ok: true, userId: user.id, email: normalizedEmail };
    }

    return {
      ok: false,
      code: "setup_required",
      error: "Complete organization setup at /setup before signing in.",
    };
  }

  const existingUser = await resolveUserForOidcLoginEmail(normalizedEmail);
  if (!existingUser) {
    if (!isSoloInstallMode()) {
      return {
        ok: false,
        code: "user_not_provisioned",
        error:
          "No app account exists for this email. Ask your administrator for access.",
      };
    }

    if ((await countNonGuestUsers()) > 0) {
      return {
        ok: false,
        code: "user_not_provisioned",
        error:
          "This personal install already has an account. Sign in with Basic Auth, then link your NetSuite email under Settings → NetSuite → Sign in.",
      };
    }

    const user = await createOAuthUser(normalizedEmail);
    if (params.orgOidcAccountId) {
      await grantUserOidcAccess({
        userId: user.id,
        orgOidcAccountId: params.orgOidcAccountId,
      });
    }
    await updateUserLastLogin(user.id);
    return { ok: true, userId: user.id, email: normalizedEmail };
  }

  if (existingUser.status === "disabled") {
    return {
      ok: false,
      code: "user_disabled",
      error: "This account has been disabled.",
    };
  }

  if (params.orgOidcAccountId) {
    const hasAccess = await userHasOidcAccess({
      userId: existingUser.id,
      orgOidcAccountId: params.orgOidcAccountId,
    });
    if (!hasAccess) {
      if (!isSoloInstallMode()) {
        return {
          ok: false,
          code: "oidc_access_denied",
          error:
            "You are not authorized to sign in with this NetSuite account.",
        };
      }
      await grantUserOidcAccess({
        userId: existingUser.id,
        orgOidcAccountId: params.orgOidcAccountId,
      });
    }
  }

  await updateUserLastLogin(existingUser.id);
  return {
    ok: true,
    userId: existingUser.id,
    email: normalizedEmail,
  };
}

export async function getNetSuiteAuthUser(userId: string) {
  const user = await getUserById(userId);
  if (!user || user.status === "disabled") {
    return null;
  }
  return user;
}
