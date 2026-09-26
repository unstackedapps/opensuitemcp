/**
 * Is this address one the public internet can route to?
 *
 * A Client ID Metadata Document is an arbitrary https URL that an
 * unauthenticated caller hands to `/api/oauth/token`, and this server then
 * fetches it. Without a check, that endpoint is a request forwarder into
 * whatever the app can reach: the Docker network, the database host, a cloud
 * provider's metadata service at 169.254.169.254.
 *
 * Pure so it can be tested without DNS; the resolution lives in the caller.
 */

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** A dotted quad whose octets are all in range. Shape alone is not enough. */
function isValidV4(address: string): boolean {
  const match = V4.exec(address);
  if (!match) {
    return false;
  }
  return match.slice(1).every((part) => Number(part) <= 255);
}

function classifyV4(address: string): boolean {
  const match = V4.exec(address);
  if (!match) {
    return false;
  }
  const [a, b] = match.slice(1, 3).map(Number);
  if (a === 0 || a === 10 || a === 127) {
    return true; // this host, private, loopback
  }
  if (a === 169 && b === 254) {
    return true; // link-local, and the cloud metadata service
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true; // private
  }
  if (a === 192 && b === 168) {
    return true; // private
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true; // carrier-grade NAT
  }
  if (a === 192 && b === 0) {
    return true; // IETF protocol assignments, incl. 192.0.0.0/24
  }
  if (a >= 224) {
    return true; // multicast and reserved
  }
  return false;
}

function classifyV6(address: string): boolean {
  const lower = address.toLowerCase().split("%")[0];
  if (lower === "::" || lower === "::1") {
    return true; // unspecified, loopback
  }
  // IPv4-mapped (::ffff:10.0.0.1) and IPv4-compatible forms tunnel the v4
  // ranges straight through, so they are classified as v4.
  const mapped = /^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(
    lower,
  );
  if (mapped) {
    return !isValidV4(mapped[1]) || classifyV4(mapped[1]);
  }
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) {
    return true; // unique local fc00::/7
  }
  if (/^fe[89ab][0-9a-f]:/.test(lower)) {
    return true; // link-local fe80::/10
  }
  if (/^ff[0-9a-f]{2}:/.test(lower)) {
    return true; // multicast
  }
  return false;
}

/** True when the literal address must not be fetched from a server. */
export function isPrivateAddress(address: string): boolean {
  const trimmed = address.trim().replace(/^\[|\]$/g, "");
  if (!trimmed) {
    return true;
  }
  if (trimmed.includes(":")) {
    return classifyV6(trimmed);
  }
  // Anything that is not a well-formed dotted quad is refused rather than
  // guessed at: "999.1.1.1" has the shape of an address and is not one.
  return !isValidV4(trimmed) || classifyV4(trimmed);
}
