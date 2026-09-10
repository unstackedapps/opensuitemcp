/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countMcpToolOutcomes,
  formatTurnDuration,
  formatTurnTokenCount,
  formatUsedSkillsAndTools,
  getMessageTurnDurationMs,
  getMessageTurnUsage,
} from "./message-turn-meta";

describe("message turn meta", () => {
  it("reads the last data-usage part", () => {
    const usage = getMessageTurnUsage({
      parts: [
        { type: "text", text: "hello" },
        {
          type: "data-usage",
          data: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
          },
        },
        {
          type: "data-usage",
          data: {
            inputTokens: 11,
            outputTokens: 22,
            totalTokens: 33,
          },
        },
      ],
    });
    assert.equal(usage?.totalTokens, 33);
  });

  it("formats a token count from totals or input plus output", () => {
    assert.equal(formatTurnTokenCount({ totalTokens: 1234 }), "1,234 tokens");
    assert.equal(
      formatTurnTokenCount({ inputTokens: 10, outputTokens: 5 }),
      "15 tokens",
    );
    assert.equal(formatTurnTokenCount(undefined), null);
    assert.equal(formatTurnTokenCount({ totalTokens: 0 }), null);
  });

  it("prefers persisted turn duration over createdAt fallback", () => {
    const durationMs = getMessageTurnDurationMs(
      {
        metadata: { createdAt: "2026-09-08T21:42:10.000Z" },
        parts: [{ type: "data-turnDuration", data: { durationMs: 12_400 } }],
      },
      "2026-09-08T21:42:00.000Z",
    );
    assert.equal(durationMs, 12_400);
  });

  it("falls back to the gap between user and assistant timestamps", () => {
    const durationMs = getMessageTurnDurationMs(
      {
        metadata: { createdAt: "2026-09-08T21:42:08.000Z" },
        parts: [{ type: "text", text: "done" }],
      },
      "2026-09-08T21:42:00.000Z",
    );
    assert.equal(durationMs, 8000);
  });

  it("formats a combined skills and tools summary", () => {
    assert.equal(formatUsedSkillsAndTools(1, 0), "Used 1 skill");
    assert.equal(formatUsedSkillsAndTools(2, 0), "Used 2 skills");
    assert.equal(formatUsedSkillsAndTools(0, 1), "Used 1 MCP tool");
    assert.equal(formatUsedSkillsAndTools(0, 3), "Used 3 MCP tools");
    assert.equal(formatUsedSkillsAndTools(1, 1), "Used 1 skill and 1 MCP tool");
    assert.equal(
      formatUsedSkillsAndTools(2, 3),
      "Used 2 skills and 3 MCP tools",
    );
    assert.equal(formatUsedSkillsAndTools(0, 0), null);
    assert.equal(
      formatUsedSkillsAndTools(3, 6, 3, 3),
      "Used 3 skills and 6 MCP tools (3 succeeded, 3 failed)",
    );
    assert.equal(
      formatUsedSkillsAndTools(0, 6, 3, 3),
      "Used 6 MCP tools (3 succeeded, 3 failed)",
    );
    assert.equal(
      formatUsedSkillsAndTools(2, 3, 3, 0),
      "Used 2 skills and 3 failed MCP tools",
    );
    assert.equal(
      formatUsedSkillsAndTools(0, 1, 1, 0),
      "Used 1 failed MCP tool",
    );
    assert.equal(
      formatUsedSkillsAndTools(0, 2, 0, 0, 2),
      "Used 2 MCP tools with no results",
    );
    assert.equal(
      formatUsedSkillsAndTools(0, 1, 0, 0, 1),
      "Used 1 MCP tool with no results",
    );
    assert.equal(
      formatUsedSkillsAndTools(1, 4, 1, 2, 1),
      "Used 1 skill and 4 MCP tools (2 succeeded, 1 failed, 1 empty)",
    );
    assert.equal(
      formatUsedSkillsAndTools(0, 3, 0, 2, 1),
      "Used 3 MCP tools (2 succeeded, 1 empty)",
    );
    assert.equal(
      formatUsedSkillsAndTools(0, 2, 1, 0, 1),
      "Used 2 MCP tools (1 failed, 1 empty)",
    );
  });

  it("counts succeeded, failed, and empty MCP tool parts", () => {
    assert.deepEqual(
      countMcpToolOutcomes([
        {
          type: "tool-ns_getSubsidiaries",
          state: "output-available",
          output: {
            success: true,
            result: {
              content: [{ type: "text", text: '{"items":[{"id":"1"}]}' }],
            },
          },
        },
        {
          type: "tool-ns_listAllReports",
          state: "output-available",
          output: {
            success: true,
            result: { content: [{ type: "text", text: "[]" }] },
          },
        },
        {
          type: "tool-ns_runCustomSuiteQL",
          state: "output-available",
          output: { error: "Unknown identifier 'subsidiary'" },
        },
        {
          type: "tool-ns_getSuiteQLMetadata",
          state: "output-available",
          output: {
            success: false,
            error: "HTTP 500: boom",
            message: "Failed to retrieve metadata",
          },
        },
      ]),
      { total: 4, succeeded: 1, failed: 2, empty: 1 },
    );
    assert.deepEqual(
      countMcpToolOutcomes([
        { type: "tool-ns_listAllReports", state: "output-error" },
        {
          type: "tool-ns_getSubsidiaries",
          state: "input-available",
        },
        {
          type: "tool-ns_runCustomSuiteQL",
          state: "output-available",
          errorText: "HTTP 500",
        },
      ]),
      { total: 3, succeeded: 0, failed: 2, empty: 0 },
    );
    assert.deepEqual(
      countMcpToolOutcomes([
        {
          type: "tool-ns_getSubsidiaries",
          state: "output-available",
          output: {
            success: true,
            result: { content: [{ type: "text", text: "{}" }] },
          },
        },
        {
          type: "tool-ns_listAllReports",
          state: "output-available",
          output: [],
        },
      ]),
      { total: 2, succeeded: 0, failed: 0, empty: 2 },
    );
  });

  it("formats turn duration compactly", () => {
    assert.equal(formatTurnDuration(400), "1s");
    assert.equal(formatTurnDuration(12_000), "12s");
    assert.equal(formatTurnDuration(65_000), "1m 5s");
    assert.equal(formatTurnDuration(120_000), "2m");
    assert.equal(formatTurnDuration(3_780_000), "1h 3m");
    assert.equal(formatTurnDuration(3_600_000), "1h");
    assert.equal(formatTurnDuration(undefined), null);
  });
});
