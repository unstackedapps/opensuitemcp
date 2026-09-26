/**
 * Reading client credentials off a token or revocation request.
 *
 * RFC 6749 section 2.3.1 puts them in an HTTP Basic header, and permits the
 * request body as an alternative. Both are advertised in
 * `token_endpoint_auth_methods_supported`, so both are read here, with the
 * header winning when a client sends both.
 *
 * A public client sends only `client_id` and no secret at all — PKCE is what
 * binds its exchange, not a shared secret it could not keep.
 */

export type ClientCredentials = {
  clientId: string | null;
  clientSecret: string | null;
};

function decodeBasic(header: string): ClientCredentials | null {
  const match = /^Basic[ \t]+([A-Za-z0-9+/=]+)$/i.exec(header.trim());
  if (!match?.[1]) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) {
    return null;
  }

  // RFC 6749 section 2.3.1 requires both halves to be form-urlencoded before
  // they are joined, so an id or secret containing a colon survives the trip.
  const clientId = safeDecode(decoded.slice(0, separator));
  const clientSecret = safeDecode(decoded.slice(separator + 1));
  if (!clientId) {
    return null;
  }
  return { clientId, clientSecret: clientSecret || null };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function readClientCredentials(params: {
  authorization: string | null;
  form: URLSearchParams;
}): ClientCredentials {
  if (params.authorization) {
    const basic = decodeBasic(params.authorization);
    if (basic) {
      return basic;
    }
  }

  return {
    clientId: params.form.get("client_id")?.trim() || null,
    clientSecret: params.form.get("client_secret")?.trim() || null,
  };
}
