"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { getUserSettings } from "@/lib/db/queries";
import { isPersonaAvailableToUser } from "@/lib/mcp/server/agent-personas";
import {
  buildApprovalRedirect,
  buildDenialRedirect,
  prepareAuthorization,
} from "@/lib/mcp/server/oauth/authorize-flow";
import type { RawAuthorizeParams } from "@/lib/mcp/server/oauth/authorize-request";
import { issueAuthorizationCode } from "@/lib/mcp/server/oauth/codes";
import { resolveNetSuiteAccounts } from "@/lib/netsuite/accounts";

/**
 * Approving and declining a sign-in request.
 *
 * Both actions re-derive the request from what was submitted rather than
 * trusting anything the page decided. The form travels through the browser, so
 * the `redirect_uri` on it is exactly as trustworthy as the one on the original
 * query string — which is to say, not at all until it has been matched against
 * what the client registered.
 */

export type ConsentState = { error: string } | null;

/** `getPublicAppOrigin` reads a Request; a server action only has headers. */
async function requestFromHeaders(): Promise<Request> {
  return new Request("https://origin.invalid", { headers: await headers() });
}

function readRawParams(formData: FormData): RawAuthorizeParams {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() ? value : undefined;
  };
  return {
    client_id: read("client_id"),
    redirect_uri: read("redirect_uri"),
    response_type: read("response_type"),
    code_challenge: read("code_challenge"),
    code_challenge_method: read("code_challenge_method"),
    state: read("state"),
    scope: read("scope"),
    resource: read("resource"),
  };
}

/**
 * One action for both buttons.
 *
 * `intent` decides which. Two actions would mean two `useActionState` hooks and
 * two copies of the re-validation, and the re-validation is the part that has
 * to be identical.
 */
export async function submitConsent(
  _previous: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  const declining = formData.get("intent") === "deny";
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Your session has expired. Sign in and try again." };
  }

  const prepared = await prepareAuthorization({
    raw: readRawParams(formData),
    user: { id: session.user.id, orgId: session.user.orgId },
    // The same headers the page resolved its origin from. Without them an
    // install with no AUTH_URL would issue an `iss` here that disagrees with
    // the one the client discovered, and the client would reject the response.
    request: await requestFromHeaders(),
  });

  if (prepared.kind === "redirect") {
    redirect(prepared.url);
  }
  if (declining) {
    if (prepared.kind === "ok" || prepared.kind === "blocked") {
      redirect(buildDenialRedirect(prepared.context));
    }
    return { error: prepared.description };
  }
  if (prepared.kind !== "ok") {
    return { error: prepared.description };
  }

  const agentName =
    (formData.get("agent_name") as string | null)?.trim() ||
    prepared.context.client.name;
  const personaId =
    (formData.get("persona_id") as string | null)?.trim() || null;
  // The consent screen's "follow my active account" option; see the form.
  const rawAccountId =
    (formData.get("netsuite_account_id") as string | null)?.trim() || null;
  const accountId = rawAccountId === "__any__" ? null : rawAccountId;

  if (
    personaId &&
    !(await isPersonaAvailableToUser(
      { id: session.user.id, orgId: session.user.orgId },
      personaId,
    ))
  ) {
    return { error: "That persona is not available to you." };
  }

  if (accountId) {
    const settings = await getUserSettings({ userId: session.user.id });
    const configured = resolveNetSuiteAccounts(settings ?? {});
    if (!configured.some((entry) => entry.accountId === accountId)) {
      return { error: "That NetSuite account is not one of yours." };
    }
  }

  const code = await issueAuthorizationCode({
    clientId: prepared.context.request.clientId,
    userId: session.user.id,
    orgId: session.user.orgId,
    redirectUri: prepared.context.request.redirectUri,
    codeChallenge: prepared.context.request.codeChallenge,
    scope: prepared.context.request.scope,
    resource: prepared.context.request.resource,
    agentName: agentName.slice(0, 128),
    personaId,
    netsuiteAccountId: accountId,
  });

  redirect(buildApprovalRedirect({ context: prepared.context, code }));
}
