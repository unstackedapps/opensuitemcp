import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeFence, readFenceTitle } from "./fence-name";

const suitescript = `/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @description Blocks editing of item quantity on order lines to prevent manual changes after entry.
 */
define(['N/ui/dialog', 'N/log'], (dialog, log) => {
});`;

describe("what a code block calls itself", () => {
  it("takes @description, which is the sentence written for this", () => {
    assert.equal(
      readFenceTitle(suitescript, "javascript"),
      "Blocks editing of item quantity on order lines to prevent manual change…",
    );
  });

  it("falls back to a leading comment", () => {
    assert.equal(
      readFenceTitle(
        "// Reconcile the August bank statement\nconst x = 1;",
        "javascript",
      ),
      "Reconcile the August bank statement",
    );
    assert.equal(
      readFenceTitle("-- Open invoices by subsidiary\nselect 1", "sql"),
      "Open invoices by subsidiary",
    );
  });

  it("takes a markdown heading", () => {
    assert.equal(
      readFenceTitle("# Vendor ledger\n\nrows", "markdown"),
      "Vendor ledger",
    );
  });

  it("ignores comment borders and tag lines", () => {
    assert.equal(
      readFenceTitle(
        "/**\n * ****\n * @NApiVersion 2.1\n */\nconst x = 1;",
        "javascript",
      ),
      "javascript snippet",
    );
  });

  it("says what it can when the code says nothing", () => {
    assert.equal(
      readFenceTitle("const x = 1;", "javascript"),
      "javascript snippet",
    );
    assert.equal(readFenceTitle("hello", "text"), "Snippet");
  });
});

describe("where a saved code block lands", () => {
  it("files it under chat/ with a fingerprint of the code", () => {
    const { path } = describeFence(
      "// Vendor ledger\nconst x = 1;",
      "javascript",
    );
    assert.match(path, /^chat\/vendor-ledger-[a-z0-9]{1,7}\.md$/);
  });

  it("gives the same code the same path, so re-saving replaces", () => {
    const first = describeFence(suitescript, "javascript");
    const second = describeFence(suitescript, "javascript");
    assert.equal(first.path, second.path);
  });

  it("gives different code different paths, even under one title", () => {
    const a = describeFence("// Ledger\nconst x = 1;", "javascript");
    const b = describeFence("// Ledger\nconst x = 2;", "javascript");
    assert.equal(a.title, b.title);
    assert.notEqual(a.path, b.path);
  });

  it("still produces a path when the title slugs to nothing", () => {
    const { path } = describeFence("// ???? ????\nconst x = 1;", "javascript");
    assert.match(path, /^chat\/[a-z0-9-]+-[a-z0-9]{1,7}\.md$/);
  });
});
