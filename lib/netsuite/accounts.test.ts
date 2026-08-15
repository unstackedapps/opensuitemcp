import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  connectedAccountSelection,
  formatNetSuiteAccountDisplay,
  isNetSuiteAccountConnected,
  resolveRequestedNetSuiteAccountId,
  tokenBelongsToAccount,
} from "./accounts";

describe("resolveRequestedNetSuiteAccountId", () => {
  it("prefers the requested account over the active account", () => {
    assert.equal(
      resolveRequestedNetSuiteAccountId({
        requested: "1234567_SB1",
        activeAccountId: "td3107923",
      }),
      "1234567-sb1",
    );
  });

  it("falls back to the active account when no request is given", () => {
    assert.equal(
      resolveRequestedNetSuiteAccountId({
        requested: "  ",
        activeAccountId: "TD3107923",
      }),
      "td3107923",
    );
    assert.equal(
      resolveRequestedNetSuiteAccountId({
        activeAccountId: null,
      }),
      null,
    );
  });
});

describe("formatNetSuiteAccountDisplay", () => {
  it("shows nickname followed by (accountId)", () => {
    assert.equal(
      formatNetSuiteAccountDisplay({
        accountId: "1234567_SB1",
        label: "Sandbox",
      }),
      "Sandbox (1234567-sb1)",
    );
  });

  it("falls back to accountId when nickname is missing or the id itself", () => {
    assert.equal(
      formatNetSuiteAccountDisplay({ accountId: "TD3107923" }),
      "td3107923",
    );
    assert.equal(
      formatNetSuiteAccountDisplay({
        accountId: "td3107923",
        label: "  td3107923  ",
      }),
      "td3107923",
    );
    assert.equal(
      formatNetSuiteAccountDisplay({
        accountId: "td3107923",
        label: "   ",
      }),
      "td3107923",
    );
  });
});

describe("isNetSuiteAccountConnected", () => {
  it("uses per-account ids when present", () => {
    assert.equal(
      isNetSuiteAccountConnected("1234567_SB1", {
        connected: true,
        connectedAccountIds: ["td3107923", "1234567-sb1"],
      }),
      true,
    );
    assert.equal(
      isNetSuiteAccountConnected("1234567-sb1", {
        connected: true,
        connectedAccountIds: ["td3107923"],
      }),
      false,
    );
  });

  it("falls back to global connected when ids are omitted", () => {
    assert.equal(
      isNetSuiteAccountConnected("td3107923", { connected: true }),
      true,
    );
    assert.equal(
      isNetSuiteAccountConnected("td3107923", { connected: false }),
      false,
    );
  });
});

describe("connectedAccountSelection", () => {
  it("returns the active connected account and not a different connected one", () => {
    const connected = [
      { accountId: "td3107923", label: "Prod" },
      { accountId: "1234567-sb1", label: "Sandbox" },
    ];
    assert.equal(
      connectedAccountSelection(connected, "1234567_SB1")?.accountId,
      "1234567-sb1",
    );
    assert.equal(connectedAccountSelection(connected, "999"), null);
    assert.equal(connectedAccountSelection(connected, null), null);
  });
});

describe("tokenBelongsToAccount", () => {
  it("matches normalized account id variants", () => {
    assert.equal(
      tokenBelongsToAccount("1234567_SB1", "1234567-sb1", "td3107923"),
      true,
    );
    assert.equal(
      tokenBelongsToAccount("TD3107923", "td3107923", "td3107923"),
      true,
    );
    assert.equal(
      tokenBelongsToAccount("td3107923", "1234567-sb1", "td3107923"),
      false,
    );
  });

  it("treats legacy null accountId as the active account only", () => {
    assert.equal(tokenBelongsToAccount(null, "td3107923", "td3107923"), true);
    assert.equal(tokenBelongsToAccount("", "td3107923", "TD3107923"), true);
    assert.equal(
      tokenBelongsToAccount(null, "1234567-sb1", "td3107923"),
      false,
    );
    assert.equal(tokenBelongsToAccount(null, "td3107923", null), false);
  });
});
