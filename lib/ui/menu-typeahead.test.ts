import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMenuTypeaheadKey } from "./menu-typeahead";

describe("which keys a search field inside a menu keeps", () => {
  it("keeps the printable ones the typeahead would act on", () => {
    for (const key of ["a", "Z", "7", " ", "-", "/"]) {
      assert.equal(isMenuTypeaheadKey(key), true, `${key} should be kept`);
    }
  });

  it("lets navigation through to the menu", () => {
    for (const key of [
      "ArrowDown",
      "ArrowUp",
      "Enter",
      "Escape",
      "Tab",
      "Home",
      "Backspace",
    ]) {
      assert.equal(isMenuTypeaheadKey(key), false, `${key} should pass`);
    }
  });
});
