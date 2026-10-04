import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type DocumentPathError,
  MAX_DOCUMENT_PATH_LENGTH,
  normalizeDocumentPath,
} from "./paths";

function refusedAs(raw: string): DocumentPathError {
  const result = normalizeDocumentPath(raw);
  assert.equal(result.ok, false, `${raw} was accepted`);
  return result.ok ? ("empty" as DocumentPathError) : result.reason;
}

function accepted(raw: string): string {
  const result = normalizeDocumentPath(raw);
  assert.equal(result.ok, true, `${raw} was refused`);
  return result.ok ? result.path : "";
}

describe("what a document path may be", () => {
  it("keeps an ordinary relative path as written", () => {
    assert.equal(accepted("vendors/acme.md"), "vendors/acme.md");
    assert.equal(accepted("notes.md"), "notes.md");
  });

  it("keeps case, because two cases are two documents", () => {
    assert.equal(accepted("Notes.md"), "Notes.md");
  });

  it("strips a leading slash rather than refusing it", () => {
    assert.equal(accepted("/memories/notes.md"), "memories/notes.md");
  });

  it("collapses empty segments and surrounding space", () => {
    assert.equal(accepted("  vendors//acme.md  "), "vendors/acme.md");
    assert.equal(accepted("vendors/ acme.md"), "vendors/acme.md");
  });

  it("refuses traversal, written plainly or encoded", () => {
    assert.equal(refusedAs("../secrets.env"), "traversal");
    assert.equal(refusedAs("notes/../../secrets.env"), "traversal");
    assert.equal(refusedAs("%2e%2e%2fsecrets.env"), "traversal");
    assert.equal(refusedAs("./notes.md"), "traversal");
  });

  it("refuses a backslash, so one separator means one thing", () => {
    assert.equal(refusedAs("notes\\acme.md"), "backslash");
    assert.equal(refusedAs("..\\secrets.env"), "backslash");
  });

  it("refuses control characters", () => {
    assert.equal(refusedAs("notes\u0000.md"), "control-character");
    assert.equal(refusedAs("notes\n.md"), "control-character");
  });

  it("refuses nothing at all", () => {
    assert.equal(refusedAs(""), "empty");
    assert.equal(refusedAs("   "), "empty");
    assert.equal(refusedAs("///"), "empty");
  });

  it("refuses a path past the column it is stored in", () => {
    assert.equal(
      accepted("a".repeat(MAX_DOCUMENT_PATH_LENGTH)).length,
      MAX_DOCUMENT_PATH_LENGTH,
    );
    assert.equal(
      refusedAs("a".repeat(MAX_DOCUMENT_PATH_LENGTH + 1)),
      "too-long",
    );
  });

  it("says why, in words a caller can pass on", () => {
    const result = normalizeDocumentPath("../secrets.env");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /cannot contain/);
    }
  });
});
