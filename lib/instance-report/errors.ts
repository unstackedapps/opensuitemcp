/**
 * The server errors this process has seen, newest first, for the instance
 * report. Two sources feed it from instrumentation.ts: `onRequestError`, for
 * an error a request threw, and console.error, because most routes catch their
 * own errors and only log them.
 *
 * Kept in memory, so a restart empties it. No imports: instrumentation runs
 * in the edge runtime as well as Node.
 */

export const MAX_RECENT_ERRORS = 50;
export const MAX_ERROR_MESSAGE_LENGTH = 300;

export type RecordedError = {
  at: string;
  source: "request" | "log";
  /** Empty for a logged error, which has no request to name. */
  method: string;
  path: string;
  /** Truncated: an error message can quote the data that caused it. */
  message: string;
  digest: string | null;
};

/**
 * Next.js prints an error a request threw with console.error as well as
 * handing it to onRequestError. Whichever arrives first records it.
 */
const seenErrors = new WeakSet<object>();

function firstSighting(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return true;
  }
  if (seenErrors.has(error)) {
    return false;
  }
  seenErrors.add(error);
  return true;
}

type ErrorLog = {
  startedAt: string;
  total: number;
  recent: RecordedError[];
};

const globalForErrors = globalThis as typeof globalThis & {
  osmcpErrorLog?: ErrorLog;
};

function errorLog(): ErrorLog {
  globalForErrors.osmcpErrorLog ??= {
    startedAt: new Date().toISOString(),
    total: 0,
    recent: [],
  };
  return globalForErrors.osmcpErrorLog;
}

function describe(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function truncate(raw: string): string {
  return raw.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${raw.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : raw;
}

/** The path without its query string, which can carry ids and tokens. */
function pathOf(path: string): string {
  return path.split("?")[0] || "/";
}

function remember(entry: RecordedError) {
  const log = errorLog();
  log.total += 1;
  log.recent.unshift(entry);
  if (log.recent.length > MAX_RECENT_ERRORS) {
    log.recent.length = MAX_RECENT_ERRORS;
  }
}

/** An error a request threw, as Next.js reports it to onRequestError. */
export function recordServerError(
  error: unknown,
  request: { method?: string; path?: string },
  at: Date = new Date(),
) {
  if (!firstSighting(error)) {
    return;
  }
  const digest =
    error && typeof error === "object" && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : null;
  remember({
    at: at.toISOString(),
    source: "request",
    method: request.method ?? "GET",
    path: pathOf(request.path ?? "/"),
    message: truncate(describe(error) || "Unknown error"),
    digest,
  });
}

/** The arguments of one console.error call. */
export function recordLoggedError(args: unknown[], at: Date = new Date()) {
  const message = args.map(describe).filter(Boolean).join(" ");
  if (!message) {
    return;
  }
  const error = args.find((arg) => arg instanceof Error);
  if (error && !firstSighting(error)) {
    return;
  }
  const digest =
    error && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : null;
  remember({
    at: at.toISOString(),
    source: "log",
    method: "",
    path: "",
    message: truncate(message),
    digest,
  });
}

export function serverErrorLog(): ErrorLog {
  const log = errorLog();
  return { ...log, recent: [...log.recent] };
}

/** For tests: start from an empty log. */
export function resetServerErrorLog() {
  globalForErrors.osmcpErrorLog = undefined;
}
