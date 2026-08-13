import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertMcpToolCallAllowed,
  disabledMcpToolNames,
  fallbackMcpToolLabel,
  isMcpToolAllowed,
  isMcpToolDisabled,
  MCP_TOOL_DISABLED_MESSAGE,
  mergeNetsuiteMcpToolSettings,
  parseNetsuiteMcpToolSettings,
  withMcpToolDisabledNames,
} from "./mcp-tool-settings";

describe("mcp-tool-settings", () => {
  it("treats missing or empty blobs as all tools allowed", () => {
    assert.deepEqual(parseNetsuiteMcpToolSettings(null), { byAccount: {} });
    assert.deepEqual(parseNetsuiteMcpToolSettings({}), { byAccount: {} });
    assert.deepEqual(
      parseNetsuiteMcpToolSettings({ byAccount: { "123": {} } }),
      {
        byAccount: { "123": { disabledNames: [] } },
      },
    );
    assert.deepEqual(disabledMcpToolNames(undefined, "1234567"), []);
    assert.equal(
      isMcpToolDisabled(undefined, "1234567", "ns_runSuiteQL"),
      false,
    );
    assert.equal(isMcpToolAllowed(null, "1234567", "ns_runSuiteQL"), true);
    assert.equal(
      isMcpToolAllowed(
        parseNetsuiteMcpToolSettings({}),
        "1234567",
        "ns_runSuiteQL",
      ),
      true,
    );
    assert.equal(
      isMcpToolAllowed(
        parseNetsuiteMcpToolSettings({ byAccount: { "1234567": {} } }),
        "1234567",
        "ns_runSuiteQL",
      ),
      true,
    );
  });

  it("normalizes account ids and dedupes disabled names", () => {
    const parsed = parseNetsuiteMcpToolSettings({
      byAccount: {
        "1234567_SB1": {
          disabledNames: [" ns_runSuiteQL ", "ns_runSuiteQL", "", "ok"],
        },
      },
    });
    assert.deepEqual(parsed.byAccount["1234567-sb1"]?.disabledNames, [
      "ns_runSuiteQL",
      "ok",
    ]);
    assert.equal(
      isMcpToolDisabled(parsed, "1234567_SB1", "ns_runSuiteQL"),
      true,
    );
    assert.equal(
      isMcpToolDisabled(parsed, "1234567_SB1", "ns_getRecord"),
      false,
    );
  });

  it("merges per-account denylists without dropping other accounts", () => {
    const merged = mergeNetsuiteMcpToolSettings(
      {
        byAccount: {
          "111": { disabledNames: ["a"] },
          "222": { disabledNames: ["b"] },
        },
      },
      {
        byAccount: {
          "222": { disabledNames: ["c"] },
        },
      },
    );
    assert.deepEqual(merged.byAccount, {
      "111": { disabledNames: ["a"] },
      "222": { disabledNames: ["c"] },
    });
  });

  it("replaces disabled names for one account", () => {
    const next = withMcpToolDisabledNames(
      { byAccount: { "111": { disabledNames: ["old"] } } },
      "111",
      ["new"],
    );
    assert.deepEqual(next.byAccount["111"]?.disabledNames, ["new"]);
  });

  it("blocks disabled tool calls before any MCP RPC", () => {
    const settings = parseNetsuiteMcpToolSettings({
      byAccount: {
        "1234567-sb1": { disabledNames: ["ns_runSuiteQL"] },
      },
    });

    const attemptCall = (toolName: string) => {
      let rpcCalled = false;
      try {
        assertMcpToolCallAllowed(settings, "1234567_SB1", toolName);
        rpcCalled = true;
        return { rpcCalled, error: null };
      } catch (error) {
        return {
          rpcCalled,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };

    const disabled = attemptCall("ns_runSuiteQL");
    assert.equal(disabled.rpcCalled, false);
    assert.equal(disabled.error, MCP_TOOL_DISABLED_MESSAGE);

    const allowed = attemptCall("ns_getRecord");
    assert.equal(allowed.rpcCalled, true);
    assert.equal(allowed.error, null);
  });

  it("builds fallback labels from title or slug", () => {
    assert.deepEqual(
      fallbackMcpToolLabel({
        name: "ns_runSuiteQL",
        description: "Run a query",
        annotations: { title: "SuiteQL" },
      }),
      { displayName: "SuiteQL", description: "Run a query" },
    );
    assert.deepEqual(fallbackMcpToolLabel({ name: "ns_get_record" }), {
      displayName: "Get Record",
      description: "No description available",
    });
  });
});
