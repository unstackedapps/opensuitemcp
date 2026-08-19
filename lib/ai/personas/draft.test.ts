import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractPersonaPlaybookDraft,
  looksLikePersonaPlaybook,
  parsePlaybookDraft,
} from "./draft";

const playbook = `# OpenSuiteMCP Persona: AP Specialist

## Persona Metadata

- **Name:** AP Specialist
- **Short Name:** AP
- **Primary Role:** Vendor bills and payment runs

## Persona Instructions

You are an accounts payable specialist operating through OpenSuiteMCP. You diagnose vendor bill issues before recommending writes, prefer SuiteQL for aging and payment status, and confirm before creating or editing vendor bills or payments.
`;

describe("persona playbook draft", () => {
  it("rejects interview recap text", () => {
    assert.equal(
      looksLikePersonaPlaybook(
        "Great, we covered your role as AP and you prefer SuiteQL. Click Save persona when ready.",
      ),
      false,
    );
  });

  it("accepts builtin-shaped playbooks", () => {
    assert.equal(looksLikePersonaPlaybook(playbook), true);
    const draft = parsePlaybookDraft(playbook);
    assert.equal(draft.name, "AP Specialist");
    assert.equal(draft.shortName, "AP");
    assert.equal(draft.primaryRole, "Vendor bills and payment runs");
  });

  it("prefers proposeCustomPersona tool output over recap text", () => {
    const draft = extractPersonaPlaybookDraft([
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Here is a summary of our interview so far.",
          },
          {
            type: "tool-proposeCustomPersona",
            output: {
              ok: true,
              name: "AP Specialist",
              shortName: "AP",
              primaryRole: "Vendor bills",
              content: playbook,
            },
          },
        ],
      },
    ]);
    assert.equal(draft?.name, "AP Specialist");
    assert.match(draft?.content ?? "", /Persona Instructions/);
  });
});
