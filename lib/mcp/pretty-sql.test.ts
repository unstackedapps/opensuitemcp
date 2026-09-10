/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeSql, prettyPrintSql } from "./pretty-sql";

describe("looksLikeSql", () => {
  it("detects SuiteQL select statements", () => {
    assert.equal(
      looksLikeSql(
        "SELECT SUM(amount) as total_revenue FROM transaction WHERE type = 'SalesOrd'",
      ),
      true,
    );
    assert.equal(looksLikeSql("No matching records."), false);
    assert.equal(looksLikeSql("{ 'select': true }"), false);
  });
});

describe("prettyPrintSql", () => {
  it("indents select lists, from, where, and boolean clauses", () => {
    const sql =
      "SELECT SUM(amount) as total_revenue, COUNT(id) as transaction_count FROM transaction WHERE type = 'SalesOrd' AND posting = 'T' AND subsidiary = 12 AND trandate >= TO_DATE('2024-01-01', 'YYYY-MM-DD') AND trandate <= TO_DATE('2026-09-09', 'YYYY-MM-DD')";

    assert.equal(
      prettyPrintSql(sql),
      `SELECT
  SUM(amount) as total_revenue,
  COUNT(id) as transaction_count
FROM transaction
WHERE type = 'SalesOrd'
  AND posting = 'T'
  AND subsidiary = 12
  AND trandate >= TO_DATE('2024-01-01', 'YYYY-MM-DD')
  AND trandate <= TO_DATE('2026-09-09', 'YYYY-MM-DD')`,
    );
  });

  it("does not split commas inside function arguments", () => {
    assert.equal(
      prettyPrintSql("SELECT TO_DATE('2024-01-01', 'YYYY-MM-DD') FROM dual"),
      `SELECT
  TO_DATE('2024-01-01', 'YYYY-MM-DD')
FROM dual`,
    );
  });

  it("indents nested subqueries", () => {
    const sql = `SELECT * FROM ( SELECT trandate, tranid FROM transaction WHERE type = 'SalesOrd' AND posting = 'T' ORDER BY trandate DESC ) WHERE ROWNUM <= 100`;
    assert.equal(
      prettyPrintSql(sql),
      `SELECT
  *
FROM (
  SELECT
    trandate,
    tranid
  FROM transaction
  WHERE type = 'SalesOrd'
    AND posting = 'T'
  ORDER BY trandate DESC
)
WHERE ROWNUM <= 100`,
    );
  });
});
