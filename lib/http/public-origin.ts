/**
 * Public site origin for redirects behind reverse proxies.
 * Prefer AUTH_URL / NEXTAUTH_URL — request.url can be https://0.0.0.0:3000
 * when Next listens on 0.0.0.0.
 */
export function getPublicAppOrigin(request?: Request): string {
  const fromEnv = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (fromEnv?.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }

  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost || request.headers.get("host");
    const proto =
      request.headers.get("x-forwarded-proto") ||
      (host?.includes("localhost") ? "http" : "https");

    if (host && !host.startsWith("0.0.0.0") && !host.startsWith("[::]")) {
      return `${proto}://${host}`.replace(/\/$/, "");
    }

    try {
      const origin = new URL(request.url).origin;
      if (!origin.includes("0.0.0.0")) {
        return origin;
      }
    } catch {
      // fall through
    }
  }

  return "http://localhost:3000";
}

/** Same-origin relative path only. Rejects protocol-relative values like `//evil.com`. */
export function isSafeAppPath(
  value: string | null | undefined,
): value is string {
  return Boolean(value?.startsWith("/") && !value.startsWith("//"));
}

export function sanitizeReturnTo(
  value: string | null | undefined,
  fallback = "/",
): string {
  return isSafeAppPath(value) ? value : fallback;
}

export function publicAppUrl(path: string, request?: Request): URL {
  const origin = `${getPublicAppOrigin(request)}/`;
  if (isSafeAppPath(path)) {
    return new URL(path, origin);
  }
  if (path.startsWith("/")) {
    return new URL("/", origin);
  }
  return new URL(`/${path}`, origin);
}
