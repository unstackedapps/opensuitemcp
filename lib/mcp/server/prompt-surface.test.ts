import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NetSuitePrompt } from "@/lib/netsuite/prompt-library";
import {
  BUILTIN_MCP_PROMPTS,
  builtinPromptMessages,
  NETSUITE_PROMPT_PREFIX,
  netsuitePromptName,
  netsuitePromptToMcp,
} from "./prompt-surface";

describe("the prompts this server publishes", () => {
  it("names every built-in uniquely", () => {
    const names = BUILTIN_MCP_PROMPTS.map((prompt) => prompt.name);
    assert.equal(new Set(names).size, names.length);
  });

  it("gives every built-in a title and a description", () => {
    for (const prompt of BUILTIN_MCP_PROMPTS) {
      assert.ok(prompt.title.length > 0, prompt.name);
      assert.ok(prompt.description.length > 0, prompt.name);
    }
  });

  it("builds a message for every built-in it lists", () => {
    for (const prompt of BUILTIN_MCP_PROMPTS) {
      const messages = builtinPromptMessages(prompt.name, {});
      assert.ok(messages, prompt.name);
      assert.equal(messages.length, 1);
      assert.equal(messages[0].role, "user");
      assert.ok(messages[0].content.text.length > 0);
    }
  });

  it("returns null for a name it does not publish", () => {
    assert.equal(builtinPromptMessages("osmcp_nope", {}), null);
  });

  it("carries a supplied argument into the message", () => {
    const messages = builtinPromptMessages("osmcp_start_task", {
      task: "Reconcile intercompany balances for Q3.",
    });
    assert.ok(messages);
    assert.match(messages[0].content.text, /Reconcile intercompany balances/);
  });

  it("asks for the argument when it is missing", () => {
    const messages = builtinPromptMessages("osmcp_start_task", {});
    assert.ok(messages);
    assert.match(messages[0].content.text, /Ask me what the task is/);
  });

  it("tells the model to open a thread, which is what it forgets", () => {
    const messages = builtinPromptMessages("osmcp_start_task", { task: "x" });
    assert.ok(messages);
    assert.match(messages[0].content.text, /osmcp_create_chat/);
    assert.match(messages[0].content.text, /osmcp_append_chat/);
  });
});

describe("a NetSuite Companion prompt becomes an MCP prompt", () => {
  const prompt: NetSuitePrompt = {
    id: "NS-Vendor Recon 01",
    name: "Vendor reconciliation",
    category: "Payables",
    roles: ["Controller"],
    industries: ["Manufacturing"],
    prompt: "Reconcile [vendor] for [period] and list variances.",
  };

  it("slugs the id into a stable, prefixed name", () => {
    const name = netsuitePromptName(prompt);
    assert.ok(name.startsWith(NETSUITE_PROMPT_PREFIX));
    assert.match(name, /^[a-z0-9_]+$/);
    assert.equal(name, netsuitePromptName(prompt));
  });

  it("never collides with the built-in namespace", () => {
    const builtins = new Set(BUILTIN_MCP_PROMPTS.map((entry) => entry.name));
    assert.ok(!builtins.has(netsuitePromptName(prompt)));
  });

  it("keeps the library's own title, and says where it came from", () => {
    const mapped = netsuitePromptToMcp(prompt);
    assert.equal(mapped.title, "Vendor reconciliation");
    assert.match(mapped.description, /Companion prompt library/);
    assert.match(mapped.description, /Controller/);
  });

  it("turns each detected blank into an argument, none required", () => {
    const mapped = netsuitePromptToMcp(prompt);
    assert.equal(mapped.arguments.length, 2);
    assert.ok(mapped.arguments.every((entry) => !entry.required));
    assert.ok(mapped.arguments.every((entry) => entry.name.length > 0));
  });

  it("still names a prompt whose id has nothing sluggable", () => {
    assert.equal(
      netsuitePromptName({ ...prompt, id: "///" }),
      `${NETSUITE_PROMPT_PREFIX}prompt`,
    );
  });
});
