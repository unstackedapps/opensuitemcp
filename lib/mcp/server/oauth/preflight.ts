/**
 * Can an agent sign in to this install, or must it be handed a key?
 *
 * Both answers are fine. A pasted key works everywhere and is the right choice
 * for a headless agent. But sign-in has two requirements a self-hosted install
 * can miss silently, and the failure looks like "the connector is broken"
 * rather than "this install is misconfigured":
 *
 *   1. **The origin must be right.** Every discovery document states its own
 *      issuer, and a client rejects the document unless that value matches the
 *      URL it fetched it from. Behind a reverse proxy with `AUTH_URL` unset,
 *      the origin is guessed from forwarded headers — often correctly, which is
 *      worse, because it works until the day it does not.
 *
 *   2. **It must be HTTPS.** OAuth 2.1 permits plain HTTP only on loopback.
 *
 * Neither is checked at request time — a client that gets this wrong simply
 * fails — so this is checked where a person can see it.
 */

export type ConnectPreflightStatus = "ready" | "configure" | "insecure";

export type ConnectPreflight = {
  status: ConnectPreflightStatus;
  title: string;
  detail: string;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function evaluateConnectPreflight(params: {
  origin: string;
  /** Whether AUTH_URL or NEXTAUTH_URL is set, rather than guessed per request. */
  originIsConfigured: boolean;
}): ConnectPreflight {
  let parsed: URL;
  try {
    parsed = new URL(params.origin);
  } catch {
    return {
      status: "configure",
      title: "Sign-in connect is not available",
      detail:
        "This install's public address could not be determined. Set AUTH_URL to the URL people reach it on.",
    };
  }

  const loopback = LOOPBACK_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !loopback) {
    return {
      status: "insecure",
      title: "Sign-in connect needs HTTPS",
      detail: `Served over ${parsed.protocol}//. Use an agent key, which works over any transport.`,
    };
  }

  if (!params.originIsConfigured) {
    return {
      status: "configure",
      title: "Set AUTH_URL before connecting an agent",
      detail: `The address is guessed from request headers, currently ${params.origin}. A client refuses to sign in when it disagrees with the one it asked for. Set AUTH_URL to pin it.`,
    };
  }

  return {
    status: "ready",
    title: "Sign-in connect is ready",
    detail: `Agents can sign in at ${params.origin}.`,
  };
}
