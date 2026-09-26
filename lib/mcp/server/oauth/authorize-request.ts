import type { ClientMetadata } from "./client-metadata";
import { CODE_CHALLENGE_METHOD, isValidCodeChallenge } from "./pkce-verify";
import { resolveRedirectUri } from "./redirect-uri";
import { resolveResource } from "./resource";

/**
 * Validating an authorization request, before a person is shown anything.
 *
 * The order matters and is fixed by RFC 6749 section 4.1.2.1. Until the
 * `redirect_uri` is known to belong to the client, nothing may be sent to it —
 * an authorization server that redirects an error to an unvalidated URI is an
 * open redirect. So failures split in two:
 *
 *   - **fatal** — the client or its redirect URI is wrong. Render a page. The
 *     person is the only one who can fix this, and they need to be told.
 *   - **redirect** — everything else. The client gets `error=` at its own
 *     verified callback, which is what turns a bad request into a retry rather
 *     than a dead browser tab.
 */

export type RawAuthorizeParams = {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
};

export type ValidatedAuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string;
  resource: string;
};

export type AuthorizeValidation =
  | { kind: "ok"; request: ValidatedAuthorizeRequest }
  | { kind: "fatal"; title: string; description: string }
  | {
      kind: "redirect";
      redirectUri: string;
      state: string | null;
      error: string;
      description: string;
    };

export function validateAuthorizeRequest(params: {
  raw: RawAuthorizeParams;
  /** The client id the caller already resolved `client` from. */
  clientId: string;
  client: ClientMetadata;
  serverResource: string;
  scope: string;
}): AuthorizeValidation {
  const { raw } = params;
  const state = raw.state?.trim() || null;

  // A client that registered exactly one redirect URI may omit the parameter,
  // per RFC 6749 section 3.1.2.3. Anything it does send must still match.
  const presented =
    raw.redirect_uri?.trim() ||
    (params.client.redirectUris.length === 1
      ? params.client.redirectUris[0]
      : null);

  if (!presented) {
    return {
      kind: "fatal",
      title: "This request is missing its redirect URI",
      description:
        "The client registered more than one callback and did not say which to use. Nothing was sent back to it.",
    };
  }

  const redirectUri = resolveRedirectUri(params.client.redirectUris, presented);
  if (!redirectUri) {
    return {
      kind: "fatal",
      title: "That callback address is not registered",
      description: `${presented} is not one of the redirect URIs ${params.client.clientName} registered with this install. Nothing was sent to it.`,
    };
  }

  const redirectError = (
    error: string,
    description: string,
  ): AuthorizeValidation => ({
    kind: "redirect",
    redirectUri,
    state,
    error,
    description,
  });

  if ((raw.response_type?.trim() || "") !== "code") {
    return redirectError(
      "unsupported_response_type",
      "This server supports the authorization code flow only.",
    );
  }

  const codeChallenge = raw.code_challenge?.trim();
  if (!codeChallenge) {
    return redirectError(
      "invalid_request",
      "code_challenge is required. This server requires PKCE.",
    );
  }
  const method = raw.code_challenge_method?.trim() || CODE_CHALLENGE_METHOD;
  if (method !== CODE_CHALLENGE_METHOD) {
    return redirectError(
      "invalid_request",
      `code_challenge_method must be ${CODE_CHALLENGE_METHOD}.`,
    );
  }
  if (!isValidCodeChallenge(codeChallenge)) {
    return redirectError("invalid_request", "code_challenge is malformed.");
  }

  const resource = resolveResource({
    requested: raw.resource,
    serverResource: params.serverResource,
  });
  if (!resource.ok) {
    return redirectError(
      "invalid_target",
      "The requested resource is not this MCP server.",
    );
  }

  return {
    kind: "ok",
    request: {
      clientId: params.clientId,
      redirectUri,
      codeChallenge,
      state,
      scope: params.scope,
      resource: resource.resource,
    },
  };
}

/**
 * Build the URL the browser is sent back to.
 *
 * Parameters go in the query, never the fragment, and are merged into whatever
 * query the registered URI already carried rather than replacing it.
 *
 * `iss` is always included. RFC 9207 makes it a SHOULD and the metadata
 * advertises it, which means a client that recorded our issuer can detect a
 * mix-up attack before it sends the code anywhere.
 */
export function buildAuthorizationRedirect(params: {
  redirectUri: string;
  issuer: string;
  state: string | null;
  result: { code: string } | { error: string; description: string };
}): string {
  const url = new URL(params.redirectUri);

  if ("code" in params.result) {
    url.searchParams.set("code", params.result.code);
  } else {
    url.searchParams.set("error", params.result.error);
    url.searchParams.set("error_description", params.result.description);
  }
  if (params.state !== null) {
    url.searchParams.set("state", params.state);
  }
  url.searchParams.set("iss", params.issuer);

  return url.toString();
}
