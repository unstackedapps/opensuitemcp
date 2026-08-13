import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  type CustomModelOption,
  openaiCompatibleModelsUrl,
} from "./provider-entries";

const BLOCKED_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "169.254.169.254",
]);

const FETCH_TIMEOUT_MS = 10_000;
const MAX_MODELS_BODY_BYTES = 1_048_576;

export function isBlockedIpAddress(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return isBlockedIpAddress(normalized.slice(7));
  }
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }
  if (
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true;
  }

  const version = isIP(normalized);
  if (version === 4) {
    const parts = normalized
      .split(".")
      .map((part) => Number.parseInt(part, 10));
    const [a, b] = parts;
    if (a === undefined || b === undefined) {
      return true;
    }
    if (a === 10 || a === 127 || a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true;
    }
    return false;
  }

  if (version === 6) {
    return (
      normalized === "::" ||
      normalized.startsWith("::1") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd")
    );
  }

  return true;
}

function isLocalhostName(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function unwrapIpv6Hostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function isLinkLocalOrMetadataIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return isLinkLocalOrMetadataIp(normalized.slice(7));
  }
  if (BLOCKED_HOSTS.has(normalized) || normalized === "fd00:ec2::254") {
    return true;
  }
  if (normalized.startsWith("fe80:")) {
    return true;
  }

  const version = isIP(normalized);
  if (version === 4) {
    const parts = normalized
      .split(".")
      .map((part) => Number.parseInt(part, 10));
    const [a, b] = parts;
    if (a === undefined || b === undefined) {
      return true;
    }
    if (a === 0) {
      return true;
    }
    return a === 169 && b === 254;
  }

  return false;
}

export async function assertAllowedProviderUrl(
  raw: string,
  resolveHost: (hostname: string) => Promise<string[]> = lookupAllAddresses,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Custom providers require an HTTP or HTTPS URL.");
  }

  const hostname = unwrapIpv6Hostname(parsed.hostname.toLowerCase());
  if (!hostname || BLOCKED_HOSTS.has(hostname)) {
    throw new Error("That host is not allowed for custom AI providers.");
  }

  const localhost = isLocalhostName(hostname);
  const isIp = isIP(hostname) !== 0;

  if (parsed.protocol === "http:" && !localhost && !isIp) {
    throw new Error("HTTP is only allowed for localhost and IP addresses.");
  }

  if (isIp && isLinkLocalOrMetadataIp(hostname)) {
    throw new Error("That host is not allowed for custom AI providers.");
  }

  if (localhost || isIp) {
    return parsed;
  }

  const addresses = await resolveHost(hostname);
  if (addresses.length === 0) {
    throw new Error("Could not resolve the custom provider hostname.");
  }
  for (const address of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new Error("Private or link-local addresses are not allowed.");
    }
  }

  return parsed;
}

async function lookupAllAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) {
    return [hostname];
  }
  const records = await lookup(hostname, { all: true });
  return records.map((record) => record.address);
}

export async function fetchOpenAiCompatibleModels(params: {
  baseUrl: string;
  apiKey?: string | null;
}): Promise<CustomModelOption[]> {
  const parsed = await assertAllowedProviderUrl(params.baseUrl);
  const url = openaiCompatibleModelsUrl(parsed.toString());
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const apiKey = params.apiKey?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Could not list models (${response.status}). Check the URL and API key.`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_MODELS_BODY_BYTES) {
      throw new Error("Model list response was too large.");
    }
    const payload = JSON.parse(buffer.toString("utf8")) as {
      data?: Array<{ id?: unknown; name?: unknown }>;
    };
    const models = Array.isArray(payload.data)
      ? payload.data.flatMap((item) => {
          if (typeof item?.id !== "string" || !item.id.trim()) {
            return [];
          }
          return [
            {
              id: item.id.trim(),
              name:
                typeof item.name === "string" && item.name.trim()
                  ? item.name.trim()
                  : undefined,
            },
          ];
        })
      : [];
    if (models.length === 0) {
      throw new Error("The endpoint returned no models.");
    }
    return models;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out listing models from the custom endpoint.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
