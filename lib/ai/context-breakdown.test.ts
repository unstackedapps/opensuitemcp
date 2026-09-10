/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countTokens } from "gpt-tokenizer";
import {
  estimateContextBreakdown,
  estimateTokensFromText,
  serializeConversationForBreakdown,
  serializeToolsForBreakdown,
} from "./context-breakdown-core";

describe("estimateTokensFromText", () => {
  it("returns 0 for empty string", () => {
    assert.equal(estimateTokensFromText(""), 0);
  });

  it("matches gpt-tokenizer countTokens for sample text", () => {
    const sample = "Connected MCP tools: ns_runReport, ns_getRecord";
    assert.equal(estimateTokensFromText(sample), countTokens(sample));
    assert.ok(estimateTokensFromText(sample) > 0);
  });
});

describe("estimateContextBreakdown", () => {
  it("returns empty when inputTokens is 0", () => {
    assert.deepEqual(
      estimateContextBreakdown({
        inputTokens: 0,
        parts: { system: "hello world" },
      }),
      [],
    );
  });

  it("puts all tokens in conversation when no weights", () => {
    const result = estimateContextBreakdown({
      inputTokens: 1000,
      parts: {},
    });
    assert.deepEqual(result, [
      { id: "conversation", label: "Conversation", tokens: 1000 },
    ]);
  });

  it("allocates billed input by tokenizer weight percentages", () => {
    const system = "You are Ava, OpenSuiteMCP's NetSuite assistant.";
    const persona = "SuiteQL Analyst playbook with join rules.";
    const conversation =
      "user: list open sales orders\nassistant: here they are";
    const systemW = estimateTokensFromText(system);
    const personaW = estimateTokensFromText(persona);
    const conversationW = estimateTokensFromText(conversation);
    const weightSum = systemW + personaW + conversationW;
    const inputTokens = 1000;

    const result = estimateContextBreakdown({
      inputTokens,
      parts: { system, persona, conversation },
    });

    assert.equal(
      result.reduce((sum, p) => sum + p.tokens, 0),
      inputTokens,
    );
    const systemTokens = result.find((p) => p.id === "system")?.tokens ?? 0;
    const personaTokens = result.find((p) => p.id === "persona")?.tokens ?? 0;
    const conversationTokens =
      result.find((p) => p.id === "conversation")?.tokens ?? 0;
    assert.ok(systemTokens > 0);
    assert.ok(personaTokens > 0);
    assert.ok(conversationTokens > 0);
    // Proportions stay close to tokenizer weights (±1 from floor rounding).
    assert.ok(
      Math.abs(systemTokens / inputTokens - systemW / weightSum) < 0.02,
    );
    assert.ok(
      Math.abs(personaTokens / inputTokens - personaW / weightSum) < 0.02,
    );
  });

  it("still shows conversation when tools weight is large", () => {
    const system = "System rules for NetSuite MCP.";
    const persona = "A persona playbook about SuiteQL.";
    const conversation = "user: show AR aging\nassistant: here is the report";
    const tools = JSON.stringify({
      name: "ns_runCustomSuiteQL",
      description: "x".repeat(8000),
    });
    const inputTokens = 5000;

    const result = estimateContextBreakdown({
      inputTokens,
      parts: { system, persona, conversation, tools },
    });

    assert.equal(
      result.reduce((sum, p) => sum + p.tokens, 0),
      inputTokens,
    );
    assert.ok((result.find((p) => p.id === "conversation")?.tokens ?? 0) > 0);
    assert.ok((result.find((p) => p.id === "tools")?.tokens ?? 0) > 0);
    assert.ok((result.find((p) => p.id === "system")?.tokens ?? 0) > 0);
    assert.ok((result.find((p) => p.id === "persona")?.tokens ?? 0) > 0);
  });

  it("omits zero-weight categories after scaling", () => {
    const system = "abcd";
    const result = estimateContextBreakdown({
      inputTokens: 100,
      parts: {
        system,
        persona: "",
        skills: "",
        knowledge: "",
        tools: "",
        conversation: "",
      },
    });
    assert.deepEqual(
      result.map((p) => p.id),
      ["system"],
    );
    assert.equal(result[0]?.tokens, 100);
  });

  it("floors negative inputTokens to empty", () => {
    assert.deepEqual(
      estimateContextBreakdown({
        inputTokens: -5,
        parts: { system: "abcd" },
      }),
      [],
    );
  });
});

describe("serializeToolsForBreakdown", () => {
  it("includes name, description, and schema", () => {
    const json = serializeToolsForBreakdown({
      ns_runReport: {
        description: "Run a report",
        inputSchema: { type: "object" },
      },
    });
    const parsed = JSON.parse(json) as Array<{
      name: string;
      description: string;
      schema: unknown;
    }>;
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.name, "ns_runReport");
    assert.equal(parsed[0]?.description, "Run a report");
    assert.deepEqual(parsed[0]?.schema, { type: "object" });
  });
});

describe("serializeConversationForBreakdown", () => {
  it("serializes role and content", () => {
    const json = serializeConversationForBreakdown([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
    assert.deepEqual(JSON.parse(json), [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
  });
});
