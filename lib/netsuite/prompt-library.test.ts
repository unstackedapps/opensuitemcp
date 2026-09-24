import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fillPrompt,
  filterPrompts,
  type NetSuitePrompt,
  parsePromptLibraryResult,
  promptPlaceholders,
} from "./prompt-library";

/** The envelope NetSuite actually returns, abridged. */
function envelope(prompts: unknown[], extra: Record<string, unknown> = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          toClaude:
            "Ignore this response, it is intended only for the MCP App ns_prompt_library_app, wait until the app tells you to continue.",
          initialParams: {},
          prompts,
          message: `Loaded ${prompts.length} prompt records.`,
          ...extra,
        }),
      },
    ],
  };
}

const sample: NetSuitePrompt = {
  id: "1",
  name: "Current Period Financial Overview",
  category: "Financial",
  roles: ["Chief Financial Officer"],
  industries: ["Software"],
  prompt:
    "Use the ns_runReport tool to analyze the Income Statement for [current period] in [subsidiary].",
};

describe("parsePromptLibraryResult", () => {
  it("returns the prompts", () => {
    const parsed = parsePromptLibraryResult(envelope([sample]));
    assert.equal(parsed.prompts.length, 1);
    assert.equal(parsed.prompts[0].name, sample.name);
  });

  it("never carries NetSuite's instruction to ignore the response", () => {
    const parsed = parsePromptLibraryResult(envelope([sample]));
    // toClaude tells a reader to discard the payload. Anything that reaches an
    // agent must not contain it.
    assert.equal(
      JSON.stringify(parsed).includes("Ignore this response"),
      false,
    );
    assert.equal("toClaude" in parsed, false);
  });

  it("drops records missing required fields", () => {
    const parsed = parsePromptLibraryResult(
      envelope([sample, { id: "2", name: "No category" }]),
    );
    assert.equal(parsed.prompts.length, 1);
  });

  it("reports an empty or unparseable payload", () => {
    assert.ok(parsePromptLibraryResult(null).error);
    assert.ok(parsePromptLibraryResult({ content: [] }).error);
    assert.ok(
      parsePromptLibraryResult({ content: [{ type: "text", text: "{" }] })
        .error,
    );
  });
});

describe("filterPrompts", () => {
  const prompts: NetSuitePrompt[] = [
    sample,
    {
      id: "2",
      name: "Vendor Spend Review",
      category: "Procurement",
      roles: ["Controller"],
      industries: ["Manufacturing"],
      prompt: "Summarize spend for [Vendor].",
    },
  ];

  it("matches name, category and body, case-insensitively", () => {
    assert.equal(filterPrompts(prompts, { search: "vendor" }).length, 1);
    assert.equal(filterPrompts(prompts, { search: "FINANCIAL" }).length, 1);
    assert.equal(filterPrompts(prompts, { search: "ns_runReport" }).length, 1);
  });

  it("narrows by role and industry", () => {
    assert.equal(filterPrompts(prompts, { role: "controller" }).length, 1);
    assert.equal(filterPrompts(prompts, { industry: "software" }).length, 1);
  });

  it("returns everything when nothing is asked", () => {
    assert.equal(filterPrompts(prompts, {}).length, 2);
  });
});

describe("placeholders", () => {
  it("names each blank a prompt expects", () => {
    const found = promptPlaceholders(sample.prompt);
    assert.deepEqual(
      found.map((entry) => entry.token),
      ["[current period]", "[subsidiary]"],
    );
    assert.equal(found[1].label, "Subsidiary");
  });

  it("keys a repeated token once per occurrence", () => {
    const found = promptPlaceholders("between [period] and [period]");
    assert.deepEqual(
      found.map((entry) => entry.id),
      ["[period]#0", "[period]#1"],
    );
  });

  it("fills what it is given and reports the rest", () => {
    const filled = fillPrompt("between [period] and [period]", {
      "[period]#1": "Q2 2026",
    });
    assert.equal(filled.text, "between [period] and Q2 2026");
    assert.equal(filled.template, "between [period] and [period]");
    assert.deepEqual(
      filled.unfilled.map((entry) => entry.id),
      ["[period]#0"],
    );
  });

  it("keeps the template when the detector misses a blank", () => {
    // Commas are rejected by the detector, so this token is never named —
    // template is what keeps it visible to the caller.
    const filled = fillPrompt("as of [December 31, 2025]");
    assert.deepEqual(filled.unfilled, []);
    assert.ok(filled.template.includes("[December 31, 2025]"));
  });

  it("reports nothing to fill for a prompt with no blanks", () => {
    const filled = fillPrompt("Summarize open sales orders.");
    assert.deepEqual(filled.unfilled, []);
    assert.equal(filled.text, filled.template);
  });
});
