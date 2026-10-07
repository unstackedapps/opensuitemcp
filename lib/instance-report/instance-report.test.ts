import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { bearerToken, configuredReportToken, reportTokenMatches } from "./auth";
import {
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_RECENT_ERRORS,
  recordLoggedError,
  recordServerError,
  resetServerErrorLog,
  serverErrorLog,
} from "./errors";

const TOKEN = "a".repeat(40);

describe("configuredReportToken", () => {
  it("is off when the variable is unset", () => {
    assert.equal(configuredReportToken({}), null);
  });

  it("is off when the token is too short to be safe", () => {
    assert.equal(
      configuredReportToken({ OSMCP_INSTANCE_REPORT_TOKEN: "short" }),
      null,
    );
  });

  it("returns a long enough token, trimmed", () => {
    assert.equal(
      configuredReportToken({ OSMCP_INSTANCE_REPORT_TOKEN: ` ${TOKEN} ` }),
      TOKEN,
    );
  });
});

describe("bearerToken", () => {
  it("reads the token from a Bearer header", () => {
    assert.equal(bearerToken(`Bearer ${TOKEN}`), TOKEN);
  });

  it("returns null for any other header", () => {
    assert.equal(bearerToken(null), null);
    assert.equal(bearerToken(`Basic ${TOKEN}`), null);
    assert.equal(bearerToken("Bearer"), null);
  });
});

describe("reportTokenMatches", () => {
  it("accepts the same token", () => {
    assert.equal(reportTokenMatches(TOKEN, TOKEN), true);
  });

  it("rejects a different or missing token", () => {
    assert.equal(reportTokenMatches(`${TOKEN}b`, TOKEN), false);
    assert.equal(reportTokenMatches("b".repeat(40), TOKEN), false);
    assert.equal(reportTokenMatches(null, TOKEN), false);
  });
});

describe("server error log", () => {
  beforeEach(() => resetServerErrorLog());

  it("keeps the newest error first, without the query string", () => {
    recordServerError(new Error("first"), { method: "GET", path: "/a" });
    recordServerError(new TypeError("second"), {
      method: "POST",
      path: "/api/chat?token=secret",
    });
    const log = serverErrorLog();
    assert.equal(log.total, 2);
    assert.equal(log.recent[0].message, "TypeError: second");
    assert.equal(log.recent[0].path, "/api/chat");
    assert.equal(log.recent[1].message, "Error: first");
  });

  it("keeps only the most recent errors but counts them all", () => {
    for (let index = 0; index < MAX_RECENT_ERRORS + 5; index += 1) {
      recordServerError(new Error(`e${index}`), { path: "/" });
    }
    const log = serverErrorLog();
    assert.equal(log.total, MAX_RECENT_ERRORS + 5);
    assert.equal(log.recent.length, MAX_RECENT_ERRORS);
    assert.equal(log.recent[0].message, `Error: e${MAX_RECENT_ERRORS + 4}`);
  });

  it("truncates long messages", () => {
    recordServerError(new Error("x".repeat(1000)), { path: "/" });
    assert.equal(
      serverErrorLog().recent[0].message.length,
      MAX_ERROR_MESSAGE_LENGTH,
    );
  });

  it("records a logged error with its prefix and error", () => {
    recordLoggedError(["[cron/maintenance]", new Error("db down")]);
    const [entry] = serverErrorLog().recent;
    assert.equal(entry.source, "log");
    assert.equal(entry.message, "[cron/maintenance] Error: db down");
    assert.equal(entry.path, "");
  });

  it("skips a console.error call with nothing to say", () => {
    recordLoggedError([{ some: "object" }]);
    assert.equal(serverErrorLog().total, 0);
  });

  it("records an error once when both sources report it", () => {
    const error = new Error("thrown");
    recordServerError(error, { path: "/api/chat" });
    recordLoggedError(["⨯", error]);
    assert.equal(serverErrorLog().total, 1);
    assert.equal(serverErrorLog().recent[0].source, "request");
  });

  it("keeps the digest Next.js attaches", () => {
    const error = Object.assign(new Error("boom"), { digest: "123" });
    recordServerError(error, { path: "/" });
    assert.equal(serverErrorLog().recent[0].digest, "123");
  });
});
