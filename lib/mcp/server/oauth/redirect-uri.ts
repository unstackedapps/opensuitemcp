/**
 * Redirect URI matching for the MCP authorization server.
 *
 * Exact comparison is the rule. There is one exception, and the specifications
 * require it: a native client listens on an ephemeral loopback port it cannot
 * know when it publishes its metadata. RFC 8252 section 7.3 says the port is
 * therefore ignored for the IP-literal form, and Claude Code needs the same
 * treatment for `localhost` — its Client ID Metadata Document declares
 * `http://localhost/callback` and `http://127.0.0.1/callback`, while the browser
 * is actually sent to whichever port it bound this session.
 *
 * Nothing else is relaxed. Scheme, host, path and query must all agree, so a
 * registered redirect can never be widened into an open redirect.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function parse(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

/** A loopback redirect is the only place the port is allowed to differ. */
export function isLoopbackRedirectUri(uri: string): boolean {
  const parsed = parse(uri);
  if (!parsed) {
    return false;
  }
  return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
}

/**
 * Shape check applied when a client registers, before anything is stored.
 *
 * HTTPS anywhere, or plain HTTP on loopback for a native client. A fragment is
 * rejected outright per RFC 6749 section 3.1.2 — the authorization response is
 * appended to the query, and a fragment already on the URI would strand it.
 */
export function isAllowedRedirectUriShape(uri: string): boolean {
  const parsed = parse(uri);
  if (!parsed || parsed.hash) {
    return false;
  }
  if (parsed.protocol === "https:") {
    return true;
  }
  return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
}

/** Does one presented redirect URI match one registered redirect URI? */
export function redirectUriMatches(
  registered: string,
  presented: string,
): boolean {
  if (registered === presented) {
    return true;
  }

  const a = parse(registered);
  const b = parse(presented);
  if (!(a && b)) {
    return false;
  }

  // Port-agnostic only when both sides are loopback on the same host. A
  // registered `http://localhost/callback` never matches `http://127.0.0.1/cb`.
  if (
    !(isLoopbackRedirectUri(registered) && isLoopbackRedirectUri(presented))
  ) {
    return false;
  }

  return (
    a.hostname === b.hostname &&
    a.pathname === b.pathname &&
    a.search === b.search &&
    !b.hash
  );
}

/**
 * Resolve a presented redirect URI against a client's registered list.
 *
 * Returns the presented URI when it is allowed — the port from the request is
 * what the browser must be sent back to, not the registered placeholder.
 */
export function resolveRedirectUri(
  registered: readonly string[],
  presented: string,
): string | null {
  for (const candidate of registered) {
    if (redirectUriMatches(candidate, presented)) {
      return presented;
    }
  }
  return null;
}

/**
 * True when every redirect a client registered is a loopback address.
 *
 * The authorization spec asks the consent screen to warn in this case: any
 * local process can bind a port and claim to be the client, so the person is
 * trusting their own machine rather than a named host.
 */
export function isLoopbackOnlyClient(registered: readonly string[]): boolean {
  return (
    registered.length > 0 &&
    registered.every((uri) => isLoopbackRedirectUri(uri))
  );
}
