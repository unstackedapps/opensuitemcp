import "server-only";

import { getPublicAppOrigin } from "@/lib/http/public-origin";
import { getMcpIssuer, getMcpResourceIdentifier, MCP_SCOPE } from "../config";
import { resolveMcpPolicyForUser } from "../policy";
import {
  buildAuthorizationRedirect,
  type RawAuthorizeParams,
  type ValidatedAuthorizeRequest,
  validateAuthorizeRequest,
} from "./authorize-request";
import { resolveOAuthClient } from "./clients";
import {
  listConnectedOAuthGrants,
  listPendingOAuthGrants,
  type OAuthGrantSummary,
} from "./grants";
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
  /**
   * `pending` is every agent this person could connect. Never empty — an empty
   * one is `blocked` instead, because there is nothing to consent to.
   */
  | {
      kind: "ok";
      context: AuthorizationContext;
      pending: OAuthGrantSummary[];
      /** Already bound elsewhere. Shown greyed out; never selectable. */
      connected: OAuthGrantSummary[];
    }
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
      /** Offer a way into the portal, for the cases a person can fix. */
      openAgentAccess?: boolean;
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
        "It arrived without a client_id, so there is no way to tell what is asking.",
    };
  }

  const resolved = await resolveOAuthClient(clientId);
  if (!resolved.ok) {
    return {
      kind: "fatal",
      title: "That client is not registered with this install",
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
      title: "Agent apps are turned off here",
      description:
        "An owner or administrator has to enable Agent apps for this organization before anyone can connect one.",
      context,
    };
  }
  if (!policy.memberAllowed) {
    return {
      kind: "blocked",
      title: "Your account is not on the Agent apps list",
      description:
        "This organization limits Agent apps to selected members. Ask an administrator to add you.",
      context,
    };
  }

  // Nothing is created here, so there is no budget to check: the agent was
  // counted when it was made. All that is left is whether one is waiting.
  // A client issued from an agent app may connect that one and no other, so it
  // is offered a list of exactly one. A client that registered itself carries
  // no binding and is offered everything waiting.
  const issuedFor = resolved.client.row.grantId;
  const waiting = await listPendingOAuthGrants(params.user.id);
  // Display only: the screen shows every app, with the ones in use greyed
  // out, so a person is not left wondering where the other one went.
  const connected = issuedFor
    ? []
    : await listConnectedOAuthGrants(params.user.id);
  const pending = issuedFor
    ? waiting.filter((grant) => grant.id === issuedFor)
    : waiting;

  if (issuedFor && pending.length === 0) {
    return {
      kind: "blocked",
      title: "That agent app is already connected",
      description: `These credentials were issued for one agent app, and it is no longer waiting for a client. Create a new agent app in App Portal → Agent apps, and use the credentials it gives you.`,
      context,
      openAgentAccess: true,
    };
  }

  if (pending.length === 0) {
    return {
      kind: "blocked",
      title: "Nothing is waiting to connect",
      description:
        connected.length > 0
          ? `${context.client.name} asked to connect, and every agent app you have is already connected to something. Create another under App Portal → Agent apps, or revoke one you no longer use.`
          : `${context.client.name} asked to connect, but you have no agent set up for sign-in. Create one under App Portal → Agent apps, choose OAuth 2.1 as its connection method, then add this connector again.`,
      context,
      openAgentAccess: true,
    };
  }

  return { kind: "ok", context, pending, connected };
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
