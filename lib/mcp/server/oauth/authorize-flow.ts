import "server-only";

import { getPublicAppOrigin } from "@/lib/http/public-origin";
import { getMcpIssuer, getMcpResourceIdentifier, MCP_SCOPE } from "../config";
import { countActiveMcpApiKeys } from "../keys";
import { resolveMcpPolicyForUser } from "../policy";
import {
  buildAuthorizationRedirect,
  type RawAuthorizeParams,
  type ValidatedAuthorizeRequest,
  validateAuthorizeRequest,
} from "./authorize-request";
import { resolveOAuthClient } from "./clients";
import { countActiveOAuthGrants } from "./grants";
import { isLoopbackOnlyClient } from "./redirect-uri";

/**
 * Everything the consent screen and its actions both have to decide.
 *
 * The page runs this to work out what to render, and the approve and deny
 * actions run it again on what was submitted. Re-running it is the point: the
 * form is the only thing standing between a tampered `redirect_uri` and a code
 * going somewhere it should not, so the action trusts the request it validates
 * rather than the one the page happened to render.
 */

export type ConsentClient = {
  name: string;
  uri: string | null;
  logoUri: string | null;
  /** Shown on the consent screen; the spec asks for the callback's host. */
  redirectHost: string;
  /** Every registered redirect is a loopback address, so warn. */
  loopbackOnly: boolean;
};

export type AuthorizationContext = {
  request: ValidatedAuthorizeRequest;
  client: ConsentClient;
  issuer: string;
};

export type PrepareOutcome =
  | { kind: "ok"; context: AuthorizationContext }
  /** Nothing may be sent to the client; render the reason. */
  | { kind: "fatal"; title: string; description: string }
  /** The client's callback is verified; send it the error. */
  | { kind: "redirect"; url: string }
  /**
   * The request is fine but this person may not grant it. Rendered rather than
   * redirected: "your administrator turned this off" is not something a
   * connector will relay, and it is the only thing that would help.
   */
  | {
      kind: "blocked";
      title: string;
      description: string;
      context: AuthorizationContext;
    };

export async function prepareAuthorization(params: {
  raw: RawAuthorizeParams;
  user: { id: string; orgId: string | null };
  request?: Request;
}): Promise<PrepareOutcome> {
  const clientId = params.raw.client_id?.trim();
  if (!clientId) {
    return {
      kind: "fatal",
      title: "This sign-in request is incomplete",
      description:
        "It arrived without a client_id, so there is no way to tell which agent is asking.",
    };
  }

  const resolved = await resolveOAuthClient(clientId);
  if (!resolved.ok) {
    return {
      kind: "fatal",
      title: "That agent is not registered with this install",
      description: resolved.description,
    };
  }

  const validation = validateAuthorizeRequest({
    raw: params.raw,
    clientId,
    client: resolved.client.metadata,
    serverResource: getMcpResourceIdentifier(params.request),
    scope: MCP_SCOPE,
  });

  const issuer = getMcpIssuer(params.request);

  if (validation.kind === "fatal") {
    return validation;
  }
  if (validation.kind === "redirect") {
    return {
      kind: "redirect",
      url: buildAuthorizationRedirect({
        redirectUri: validation.redirectUri,
        issuer,
        state: validation.state,
        result: {
          error: validation.error,
          description: validation.description,
        },
      }),
    };
  }

  const context: AuthorizationContext = {
    request: validation.request,
    client: {
      name: resolved.client.metadata.clientName,
      uri: resolved.client.metadata.clientUri,
      logoUri: resolved.client.metadata.logoUri,
      redirectHost: redirectHost(validation.request.redirectUri),
      loopbackOnly: isLoopbackOnlyClient(resolved.client.metadata.redirectUris),
    },
    issuer,
  };

  const policy = await resolveMcpPolicyForUser(
    params.user.orgId,
    params.user.id,
  );
  if (!policy.enabled) {
    return {
      kind: "blocked",
      title: "Agent access is turned off here",
      description:
        "An owner or administrator has to enable Agent access for this organization before anyone can connect an agent.",
      context,
    };
  }
  if (!policy.memberAllowed) {
    return {
      kind: "blocked",
      title: "Your account is not on the Agent access list",
      description:
        "This organization limits Agent access to selected members. Ask an administrator to add you.",
      context,
    };
  }

  // A signed-in agent and a pasted key are the same thing to the person holding
  // them, so they share one budget rather than each having their own.
  const [keys, grants] = await Promise.all([
    countActiveMcpApiKeys(params.user.id),
    countActiveOAuthGrants(params.user.id),
  ]);
  if (keys + grants >= policy.maxKeysPerUser) {
    return {
      kind: "blocked",
      title: "You have reached your agent limit",
      description: `This organization allows ${policy.maxKeysPerUser} active agents per member, and you have ${keys + grants}. Revoke one under App Portal → Agent access, then try again.`,
      context,
    };
  }

  return { kind: "ok", context };
}

/** The deny path, and the cancel button on a blocked screen. */
export function buildDenialRedirect(context: AuthorizationContext): string {
  return buildAuthorizationRedirect({
    redirectUri: context.request.redirectUri,
    issuer: context.issuer,
    state: context.request.state,
    result: {
      error: "access_denied",
      description: "The person declined this request.",
    },
  });
}

export function buildApprovalRedirect(params: {
  context: AuthorizationContext;
  code: string;
}): string {
  return buildAuthorizationRedirect({
    redirectUri: params.context.request.redirectUri,
    issuer: params.context.issuer,
    state: params.context.request.state,
    result: { code: params.code },
  });
}

/** This install's own address, for the "you are signing in to" line. */
export function installOrigin(request?: Request): string {
  return getPublicAppOrigin(request);
}

function redirectHost(redirectUri: string): string {
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
}
