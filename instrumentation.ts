import { registerOTel } from "@vercel/otel";
import type { Instrumentation } from "next";
import {
  recordLoggedError,
  recordServerError,
} from "./lib/instance-report/errors";

const globalForConsole = globalThis as typeof globalThis & {
  osmcpConsoleErrorPatched?: boolean;
};

export function register() {
  registerOTel({ serviceName: "ai-chatbot" });

  // Most routes catch their own errors and only log them. The instance report
  // keeps a copy of each, so whoever operates the instance can see them.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    !globalForConsole.osmcpConsoleErrorPatched
  ) {
    globalForConsole.osmcpConsoleErrorPatched = true;
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      recordLoggedError(args);
      original(...args);
    };
  }
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
) => {
  recordServerError(error, request);
};
