/**
 * RFC 8707 resource indicators.
 *
 * A token is minted for one audience — this install's MCP endpoint — so a
 * credential lifted from here cannot be replayed at somebody else's server.
 *
 * The parameter is optional in practice, and that is a deliberate concession
 * rather than an oversight: Claude's connector does not send `resource` on
 * either the authorization or the token request. Requiring it would refuse the
 * single most common client. When it is absent the audience defaults to this
 * server; when it is present it must actually name this server.
 */

const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443",
};

/**
 * Reduce a resource identifier to the one spelling we compare and store.
 *
 * Scheme and host are lowercased, a default port is dropped, a bare trailing
 * slash is dropped, and a fragment is rejected outright — RFC 8707 section 2
 * forbids one. Everything else, including a meaningful path, is preserved:
 * `https://host/api/mcp` and `https://host` are different resources.
 */
export function canonicalizeResourceUri(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  if (parsed.hash) {
    return null;
  }
  if (!(parsed.protocol === "https:" || parsed.protocol === "http:")) {
    return null;
  }

  const port =
    parsed.port && parsed.port !== DEFAULT_PORTS[parsed.protocol]
      ? `:${parsed.port}`
      : "";
  const path =
    parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");

  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port}${path}${parsed.search}`;
}

/** Does a presented `resource` parameter name this server? */
export function resourceMatches(expected: string, presented: string): boolean {
  const a = canonicalizeResourceUri(expected);
  const b = canonicalizeResourceUri(presented);
  return Boolean(a && b && a === b);
}

/**
 * Resolve the audience for a request.
 *
 * Absent means this server. Present and wrong is an error the caller must
 * surface as `invalid_target`, per RFC 8707 section 2 — quietly substituting
 * our own identifier would hand the client a token for a server it did not ask
 * for, which is the confused-deputy case the parameter exists to prevent.
 */
export function resolveResource(params: {
  requested: string | null | undefined;
  serverResource: string;
}): { ok: true; resource: string } | { ok: false; error: "invalid_target" } {
  const canonicalServer =
    canonicalizeResourceUri(params.serverResource) ?? params.serverResource;

  if (!params.requested?.trim()) {
    return { ok: true, resource: canonicalServer };
  }
  if (resourceMatches(params.serverResource, params.requested)) {
    return { ok: true, resource: canonicalServer };
  }
  return { ok: false, error: "invalid_target" };
}
