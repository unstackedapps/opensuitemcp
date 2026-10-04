import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { controlResponsiveDefaults } from "./control-defaults";

describe("which responsive defaults a control keeps", () => {
  it("keeps all three when the caller says nothing", () => {
    assert.equal(controlResponsiveDefaults(), "md:h-10 md:px-3 md:py-2");
    assert.equal(controlResponsiveDefaults(""), "md:h-10 md:px-3 md:py-2");
    assert.equal(
      controlResponsiveDefaults("rounded-lg text-sm"),
      "md:h-10 md:px-3 md:py-2",
    );
  });

  it("drops the height default when the caller set a height", () => {
    assert.equal(controlResponsiveDefaults("h-8"), "md:px-3 md:py-2");
    assert.equal(controlResponsiveDefaults("text-sm h-9"), "md:px-3 md:py-2");
  });

  it("drops the horizontal padding default for px, pl or pr", () => {
    for (const supplied of ["pl-9", "px-4", "pr-10"]) {
      assert.equal(
        controlResponsiveDefaults(supplied),
        "md:h-10 md:py-2",
        `${supplied} should drop md:px-3`,
      );
    }
  });

  it("drops the vertical padding default for py, pt or pb", () => {
    assert.equal(controlResponsiveDefaults("py-3"), "md:h-10 md:px-3");
    assert.equal(controlResponsiveDefaults("pt-4"), "md:h-10 md:px-3");
  });

  it("does not mistake one axis for the other", () => {
    assert.equal(controlResponsiveDefaults("px-4"), "md:h-10 md:py-2");
    assert.equal(controlResponsiveDefaults("py-4"), "md:h-10 md:px-3");
  });

  it("does not match a property that merely contains the letters", () => {
    assert.equal(
      controlResponsiveDefaults(
        "shadow-none placeholder:text-muted-foreground",
      ),
      "md:h-10 md:px-3 md:py-2",
    );
  });

  it("honors an important override too", () => {
    assert.equal(controlResponsiveDefaults("!h-7"), "md:px-3 md:py-2");
  });

  it("drops every default when the caller set all three", () => {
    assert.equal(controlResponsiveDefaults("h-8 px-2 py-1"), "");
  });
});
