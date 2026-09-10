/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage } from "@/lib/types";
import { getSkillsForAssistantTurn } from "./turn-chips";

function message(
  id: string,
  role: "user" | "assistant",
  parts: ChatMessage["parts"],
): ChatMessage {
  return {
    id,
    role,
    parts,
    metadata: { createdAt: "2026-09-09T12:00:00.000Z" },
  } as ChatMessage;
}

describe("getSkillsForAssistantTurn", () => {
  it("uses skills recorded on the assistant turn, not current auto settings", () => {
    const chips = getSkillsForAssistantTurn(
      [
        message("u1", "user", [{ type: "text", text: "hello" }]),
        message("a1", "assistant", [
          {
            type: "data-turnSkills",
            data: [{ id: "skill-a", name: "Skill A" }],
          },
          { type: "text", text: "done" },
        ]),
      ],
      "a1",
    );
    assert.deepEqual(chips, [{ id: "skill-a", name: "Skill A" }]);
  });

  it("falls back to slash-invoked skills on the preceding user message", () => {
    const chips = getSkillsForAssistantTurn(
      [
        message("u1", "user", [
          {
            type: "data-invokedConnectedSkills",
            data: [{ id: "slash-1", slug: "slash-1", name: "Slash skill" }],
          },
          { type: "text", text: "/slash-1" },
        ]),
        message("a1", "assistant", [{ type: "text", text: "done" }]),
      ],
      "a1",
    );
    assert.deepEqual(chips, [{ id: "slash-1", name: "Slash skill" }]);
  });

  it("does not invent skills when nothing was recorded for the turn", () => {
    const chips = getSkillsForAssistantTurn(
      [
        message("u1", "user", [{ type: "text", text: "hello" }]),
        message("a1", "assistant", [{ type: "text", text: "done" }]),
      ],
      "a1",
    );
    assert.deepEqual(chips, []);
  });
});
