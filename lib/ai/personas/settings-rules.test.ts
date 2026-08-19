import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AVA_PERSONA_ID, isValidPersonaId } from "./catalog";

/**
 * Mirrors settings API rule: hidePersonaPicker requires a valid default.
 */
function assertHidePickerAllowed(
  hidePersonaPicker: boolean,
  defaultPersonaId: string | null,
  customPersonas: Array<{
    id: string;
    name: string;
    content: string;
    updatedAt: string;
  }> = [],
): { ok: true } | { ok: false; error: string } {
  if (!hidePersonaPicker) {
    return { ok: true };
  }
  const defId = defaultPersonaId?.trim() || AVA_PERSONA_ID;
  if (!isValidPersonaId(defId, customPersonas)) {
    return {
      ok: false,
      error:
        "A valid default persona is required when the persona picker is hidden",
    };
  }
  return { ok: true };
}

describe("hidePersonaPicker settings rule", () => {
  it("allows hide with Ava or builtin default", () => {
    assert.equal(assertHidePickerAllowed(true, null).ok, true);
    assert.equal(assertHidePickerAllowed(true, AVA_PERSONA_ID).ok, true);
    assert.equal(
      assertHidePickerAllowed(true, "financial-controller").ok,
      true,
    );
  });

  it("rejects hide with unknown default", () => {
    const result = assertHidePickerAllowed(true, "not-a-persona");
    assert.equal(result.ok, false);
  });

  it("allows hide with custom default when present", () => {
    const custom = [
      {
        id: "c1",
        name: "C",
        content: "x",
        updatedAt: "2020-01-01",
      },
    ];
    assert.equal(assertHidePickerAllowed(true, "c1", custom).ok, true);
  });
});
