import { timingSafeEqual } from "node:crypto";

/**
 * The instance report is off unless OSMCP_INSTANCE_REPORT_TOKEN is set, and
 * then answers only a request bearing that token.
 */

export const INSTANCE_REPORT_TOKEN_ENV = "OSMCP_INSTANCE_REPORT_TOKEN";

/** Shorter than this and a token is guessable, so the report stays off. */
export const MIN_REPORT_TOKEN_LENGTH = 32;

export function configuredReportToken(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const token = env[INSTANCE_REPORT_TOKEN_ENV]?.trim();
  return token && token.length >= MIN_REPORT_TOKEN_LENGTH ? token : null;
}

export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : null;
}

export function reportTokenMatches(
  presented: string | null,
  expected: string,
): boolean {
  if (!presented) {
    return false;
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
