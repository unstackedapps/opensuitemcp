import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NetSuitePrompt } from "@/lib/netsuite/prompt-library";
import {
  BUILTIN_BRIEFINGS,
  briefingMessages,
  NETSUITE_PROMPT_PREFIX,
  netsuitePromptArguments,
  netsuitePromptName,
  netsuitePromptNames,
  netsuitePromptToMcp,
  netsuitePromptValues,
  publishedPromptNames,
  resolvePromptMessages,
} from "./prompt-surface";

describe("the prompts this server publishes", () => {
  it("names every built-in uniquely", () => {
    const names = BUILTIN_BRIEFINGS.map((prompt) => prompt.name);
    assert.equal(new Set(names).size, names.length);
  });

  it("gives every built-in a title and a description", () => {
    for (const prompt of BUILTIN_BRIEFINGS) {
      assert.ok(prompt.title.length > 0, prompt.name);
      assert.ok(prompt.description.length > 0, prompt.name);
    }
  });

  it("builds a message for every built-in it lists", () => {
    for (const prompt of BUILTIN_BRIEFINGS) {
      const messages = briefingMessages(prompt.name, {});
      assert.ok(messages, prompt.name);
      assert.equal(messages.length, 1);
      assert.equal(messages[0].role, "user");
      assert.ok(messages[0].content.text.length > 0);
    }
  });

  it("returns null for a name it does not publish", () => {
    assert.equal(briefingMessages("osmcp_nope", {}), null);
  });

  it("carries a supplied argument into the message", () => {
    const messages = briefingMessages("osmcp_start_task", {
      task: "Reconcile intercompany balances for Q3.",
    });
    assert.ok(messages);
    assert.match(messages[0].content.text, /Reconcile intercompany balances/);
  });

  it("asks for the argument when it is missing", () => {
    const messages = briefingMessages("osmcp_start_task", {});
    assert.ok(messages);
    assert.match(messages[0].content.text, /Ask me what the task is/);
  });

  it("tells the model to open a thread, which is what it forgets", () => {
    const messages = briefingMessages("osmcp_start_task", { task: "x" });
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

  it("produces a stable, prefixed, client-safe name", () => {
    const name = netsuitePromptName(prompt);
    assert.ok(name.startsWith(NETSUITE_PROMPT_PREFIX));
    assert.match(name, /^[a-z0-9_]+$/);
    assert.equal(name, netsuitePromptName(prompt));
  });

  it("never collides with the built-in namespace", () => {
    const builtins = new Set(BUILTIN_BRIEFINGS.map((entry) => entry.name));
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

  it("names arguments readably, not by placeholder id", () => {
    // Found live: arguments went out as "[current period]#0", which is the
    // internal id and is what a client would render as a field label.
    const mapped = netsuitePromptToMcp(prompt);
    assert.deepEqual(
      mapped.arguments.map((entry) => entry.name),
      ["vendor", "period"],
    );
    assert.ok(
      mapped.arguments.every((entry) => !/[[\]#]/.test(entry.name)),
      "no brackets or hashes in an argument name",
    );
  });

  it("numbers a blank the prompt asks for twice", () => {
    const twice: NetSuitePrompt = {
      ...prompt,
      prompt: "Compare [period] against [period] for [subsidiary].",
    };
    assert.deepEqual(
      netsuitePromptArguments(twice).map((entry) => entry.name),
      ["period", "period_2", "subsidiary"],
    );
  });

  it("keeps the label as the argument description", () => {
    const mapped = netsuitePromptToMcp(prompt);
    assert.equal(mapped.arguments[0].description, "Vendor");
  });

  it("names from the title, not the id", () => {
    // Found live: the Companion library numbers its entries 1..100, so slugging
    // the id produced a menu of netsuite_1 through netsuite_100.
    assert.equal(
      netsuitePromptName(prompt),
      `${NETSUITE_PROMPT_PREFIX}vendor_reconciliation`,
    );
  });

  it("still names a prompt whose name and id have nothing sluggable", () => {
    assert.equal(
      netsuitePromptName({ ...prompt, name: "///", id: "///" }),
      `${NETSUITE_PROMPT_PREFIX}prompt`,
    );
  });
});

describe("filling a prompt from named arguments", () => {
  const prompt: NetSuitePrompt = {
    id: "10",
    name: "Board Report Synthesis",
    category: "Financial",
    roles: [],
    industries: [],
    prompt: "Compare [period] against [period] for [subsidiary].",
  };

  it("routes each named argument to its own blank", () => {
    assert.deepEqual(
      netsuitePromptValues(prompt, {
        period: "Q3 2026",
        period_2: "Q2 2026",
        subsidiary: "Parent",
      }),
      {
        "[period]#0": "Q3 2026",
        "[period]#1": "Q2 2026",
        "[subsidiary]#0": "Parent",
      },
    );
  });

  it("still accepts a raw placeholder id", () => {
    assert.deepEqual(netsuitePromptValues(prompt, { "[period]#1": "Q2" }), {
      "[period]#1": "Q2",
    });
  });

  it("stringifies a number or boolean rather than dropping it", () => {
    assert.deepEqual(netsuitePromptValues(prompt, { period: 2026 }), {
      "[period]#0": "2026",
    });
  });

  it("drops null and undefined", () => {
    assert.deepEqual(
      netsuitePromptValues(prompt, { period: null, subsidiary: undefined }),
      {},
    );
  });

  it("returns nothing when no arguments were passed", () => {
    assert.deepEqual(netsuitePromptValues(prompt, undefined), {});
  });
});

describe("naming a whole library", () => {
  const entry = (id: string, name: string): NetSuitePrompt => ({
    id,
    name,
    category: "Financial",
    roles: [],
    industries: [],
    prompt: "Do the thing.",
  });

  it("gives every entry a distinct name", () => {
    const prompts = [
      entry("1", "Current Period Financial Overview"),
      entry("42", "Current Period Financial Overview"),
      entry("7", "Cash Flow Detail"),
    ];
    const names = netsuitePromptNames(prompts, new Set());
    assert.equal(names.size, 3);
    assert.equal(new Set(names.values()).size, 3);
  });

  it("keeps both entries that share a title, rather than dropping one", () => {
    // The live library ships two called "Current Period Financial Overview";
    // skipping the second made a prompt visible in NetSuite unpickable here.
    const prompts = [
      entry("1", "Current Period Financial Overview"),
      entry("42", "Current Period Financial Overview"),
    ];
    const names = netsuitePromptNames(prompts, new Set());
    assert.ok(names.has("1"));
    assert.ok(names.has("42"));
    assert.notEqual(names.get("1"), names.get("42"));
    assert.match(names.get("42") as string, /_42$/);
  });

  it("never takes a name a built-in already has", () => {
    const taken = new Set(BUILTIN_BRIEFINGS.map((p) => p.name));
    const names = netsuitePromptNames(
      [entry("1", "Start a NetSuite task")],
      taken,
    );
    for (const name of names.values()) {
      assert.ok(!taken.has(name));
    }
  });

  it("is stable, so a name from the list still resolves on get", () => {
    const prompts = [entry("1", "A"), entry("2", "A"), entry("3", "B")];
    assert.deepEqual(
      [...netsuitePromptNames(prompts, new Set()).entries()],
      [...netsuitePromptNames(prompts, new Set()).entries()],
    );
  });
});

describe("one prompt, over either transport", () => {
  const library: NetSuitePrompt[] = [
    {
      id: "42",
      name: "Current Period Financial Overview",
      prompt: "Summarise [period] for [subsidiary].",
      category: "Finance",
      roles: ["Controller"],
      industries: [],
    } as NetSuitePrompt,
  ];

  it("resolves a built-in without touching the library", () => {
    const resolved = resolvePromptMessages(
      "osmcp_start_task",
      { task: "Reconcile August" },
      [],
    );
    assert.ok(resolved);
    assert.equal(resolved.messages.length, 1);
    assert.match(resolved.messages[0].content.text, /osmcp_whoami/);
    assert.match(resolved.messages[0].content.text, /Reconcile August/);
  });

  it("asks for the task when a built-in is given no argument", () => {
    const resolved = resolvePromptMessages("osmcp_start_task", undefined, []);
    assert.ok(resolved);
    assert.match(resolved.messages[0].content.text, /Ask me what the task is/);
  });

  it("resolves an account prompt by its published name", () => {
    const name = netsuitePromptName(library[0]);
    const resolved = resolvePromptMessages(
      name,
      { period: "Q3 2026", subsidiary: "Seven" },
      library,
    );
    assert.ok(resolved);
    assert.match(resolved.messages[0].content.text, /Q3 2026/);
    assert.match(resolved.messages[0].content.text, /Seven/);
  });

  it("names the blanks still open rather than leaving brackets unexplained", () => {
    const name = netsuitePromptName(library[0]);
    const resolved = resolvePromptMessages(
      name,
      { period: "Q3 2026" },
      library,
    );
    assert.ok(resolved);
    assert.match(
      resolved.messages[0].content.text,
      /Still to fill: Subsidiary/,
    );
  });

  it("returns nothing for a name this server does not publish", () => {
    assert.equal(resolvePromptMessages("nope", undefined, library), null);
    assert.equal(
      resolvePromptMessages("netsuite_not_a_prompt", undefined, library),
      null,
    );
  });

  it("lists every published name, built-ins first", () => {
    const names = publishedPromptNames(library);
    for (const builtin of BUILTIN_BRIEFINGS) {
      assert.ok(names.includes(builtin.name), `${builtin.name} is missing`);
    }
    assert.ok(names.includes(netsuitePromptName(library[0])));
  });
});
