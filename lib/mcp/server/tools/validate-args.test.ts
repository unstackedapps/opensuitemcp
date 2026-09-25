import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JsonSchemaObject } from "./types";
import { validateToolArgs } from "./validate-args";

const appendChat: JsonSchemaObject = {
  type: "object",
  properties: {
    chatId: { type: "string" },
    role: { type: "string", enum: ["user", "assistant"] },
    text: { type: "string" },
  },
  required: ["chatId", "role", "text"],
  additionalProperties: false,
};

describe("validateToolArgs", () => {
  it("accepts a well-formed call", () => {
    assert.equal(
      validateToolArgs("osmcp_append_chat", appendChat, {
        chatId: "c1",
        role: "assistant",
        text: "done",
      }),
      null,
    );
  });

  it("rejects the part an agent loses silently today", () => {
    const error = validateToolArgs("osmcp_append_chat", appendChat, {
      chatId: "c1",
      role: "assistant",
      text: "calling NetSuite",
      parts: [{ type: "tool-call" }],
    });
    assert.match(String(error), /does not accept `parts`/);
    assert.match(String(error), /`chatId`, `role` and `text`/);
  });

  it("names a missing required argument", () => {
    assert.match(
      String(
        validateToolArgs("osmcp_append_chat", appendChat, { role: "user" }),
      ),
      /requires `chatId`/,
    );
  });

  it("rejects a wrong type", () => {
    assert.match(
      String(
        validateToolArgs("osmcp_append_chat", appendChat, {
          chatId: "c1",
          role: "user",
          text: 42,
        }),
      ),
      /`text` must be `string`/,
    );
  });

  it("rejects a value outside an enum", () => {
    assert.match(
      String(
        validateToolArgs("osmcp_append_chat", appendChat, {
          chatId: "c1",
          role: "tool",
          text: "x",
        }),
      ),
      /`role` must be one of `user` and `assistant`/,
    );
  });

  it("leaves a forwarded schema no stricter than it states", () => {
    // NetSuite schemas arrive without additionalProperties; extras stay legal.
    const forwarded: JsonSchemaObject = {
      type: "object",
      properties: { recordType: { type: "string" } },
    };
    assert.equal(
      validateToolArgs("netsuite_get", forwarded, {
        recordType: "vendorbill",
        expandSubresources: true,
      }),
      null,
    );
  });

  it("ignores an absent optional argument", () => {
    const schema: JsonSchemaObject = {
      type: "object",
      properties: { limit: { type: "integer" } },
      additionalProperties: false,
    };
    assert.equal(validateToolArgs("osmcp_list_chats", schema, {}), null);
    assert.match(
      String(validateToolArgs("osmcp_list_chats", schema, { limit: 1.5 })),
      /`limit` must be `integer`/,
    );
  });
});
