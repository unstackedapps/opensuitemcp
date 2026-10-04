import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  netsuiteToolIsReadOnly,
  netsuiteToolRequiredScope,
} from "./netsuite-write-classifier";

describe("netsuiteToolIsReadOnly", () => {
  it("treats retrieval tools as read-only", () => {
    const readers = [
      "ns_getRecord",
      "ns_listAllReports",
      "ns_searchRecords",
      "ns_describeRecordType",
      "ns_runCustomSuiteQL",
      "ns_savedSearchResults",
      "queryWorkbook",
      "fetch_transaction",
    ];
    for (const name of readers) {
      assert.equal(netsuiteToolIsReadOnly(name), true, name);
    }
  });

  it("treats mutating tools as write", () => {
    const writers = [
      "ns_createRecord",
      "ns_updateRecord",
      "ns_deleteRecord",
      "ns_upsertCustomer",
      "ns_transformSalesOrder",
      "ns_submitJournalEntry",
      "ns_voidPayment",
      "uploadFile",
    ];
    for (const name of writers) {
      assert.equal(netsuiteToolIsReadOnly(name), false, name);
    }
  });

  it("lets a write verb outrank a read verb in the same name", () => {
    assert.equal(netsuiteToolIsReadOnly("ns_getAndUpdateRecord"), false);
    assert.equal(netsuiteToolIsReadOnly("ns_searchAndDeleteStale"), false);
  });

  it("reads a report rather than warning about it", () => {
    // Announced as destructive, so a read-only key could not run one.
    assert.equal(netsuiteToolIsReadOnly("ns_runReport"), true);
    assert.equal(netsuiteToolIsReadOnly("ns_report_filters_app"), true);
    assert.equal(netsuiteToolRequiredScope("ns_runReport"), "read");
  });

  it("reads an MCP App launcher", () => {
    // A launcher opens a surface; what a person does in it arrives as its own
    // tool call and is classified on its own name.
    assert.equal(netsuiteToolIsReadOnly("ns_prompt_library_app"), true);
    assert.equal(netsuiteToolIsReadOnly("ns_selector_app"), true);
  });

  it("keeps a write verb ahead of either new hint", () => {
    assert.equal(netsuiteToolIsReadOnly("ns_deleteReport"), false);
    assert.equal(netsuiteToolIsReadOnly("ns_saveReport"), false);
    assert.equal(netsuiteToolIsReadOnly("ns_installApp"), false);
    assert.equal(netsuiteToolIsReadOnly("ns_uploadApp"), false);
  });

  it("fails closed for unrecognized names", () => {
    assert.equal(netsuiteToolIsReadOnly("ns_mystery"), false);
    assert.equal(netsuiteToolIsReadOnly(""), false);
    assert.equal(netsuiteToolIsReadOnly("___"), false);
  });

  it("splits camelCase, snake_case, and kebab-case alike", () => {
    assert.equal(netsuiteToolIsReadOnly("getRecord"), true);
    assert.equal(netsuiteToolIsReadOnly("get_record"), true);
    assert.equal(netsuiteToolIsReadOnly("get-record"), true);
    assert.equal(netsuiteToolIsReadOnly("GetRecord"), true);
  });

  it("maps the classification onto a required scope", () => {
    assert.equal(netsuiteToolRequiredScope("ns_listAllReports"), "read");
    assert.equal(netsuiteToolRequiredScope("ns_createRecord"), "write");
  });
});

describe("ambiguous run/execute verbs", () => {
  it("reads SuiteQL and saved searches but not scripts", () => {
    assert.equal(netsuiteToolIsReadOnly("ns_runCustomSuiteQL"), true);
    assert.equal(netsuiteToolIsReadOnly("ns_runSavedSearch"), true);
    assert.equal(netsuiteToolIsReadOnly("ns_runScript"), false);
    assert.equal(netsuiteToolIsReadOnly("ns_executeWorkflow"), false);
  });

  it("still refuses a SuiteQL name carrying a write verb", () => {
    assert.equal(netsuiteToolIsReadOnly("ns_createSuiteQLView"), false);
  });
});
