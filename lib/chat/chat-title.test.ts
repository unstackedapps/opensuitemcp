/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fallbackChatTitle, sanitizeChatTitle } from "./chat-title";

describe("chat title", () => {
  it("uses the first message as a fallback without ellipsis truncation", () => {
    assert.equal(
      fallbackChatTitle("  How do I look up a customer in SuiteQL?  "),
      "How do I look up a customer in SuiteQL?",
    );
    assert.equal(fallbackChatTitle("   \n"), "New Chat");
  });

  it("strips model formatting without shortening the title", () => {
    assert.equal(
      sanitizeChatTitle('Title: "Creating a concise skill.md file"'),
      "Creating a concise skill.md file",
    );
    assert.equal(
      sanitizeChatTitle("## **AR aging by subsidiary**\nextra line"),
      "AR aging by subsidiary",
    );
  });
});
