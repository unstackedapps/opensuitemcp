import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENT_ACTIVE_MS,
  chatActivityQuery,
  STREAM_STALE_MS,
} from "./chat-activity-sql";

describe("chat activity subqueries", () => {
  it("correlate against the Chat table by name, not a bare column", () => {
    const { sql: text } = chatActivityQuery().toSQL();
    // Two subqueries, both correlated. A bare "id" binds to "Stream"."id"
    // instead, which silently matches nothing and leaves every dot wrong.
    assert.equal(text.match(/s\."chatId" = "Chat"\."id"/g)?.length, 2);
    assert.doesNotMatch(text, /s\."chatId" = "id"/);
  });

  it("passes the stale cutoff as a bound parameter in seconds", () => {
    const { sql: text, params } = chatActivityQuery().toSQL();
    assert.match(text, /make_interval\(secs => \$1\)/);
    assert.equal(params[0], STREAM_STALE_MS / 1000);
  });

  it("never yields null when a chat has no agent stamp", () => {
    // agentActiveAt is nullable, and NULL > timestamp is NULL, so without a
    // coalesce isLive came back null for every chat an agent never touched.
    const { sql: text } = chatActivityQuery().toSQL();
    assert.match(text, /COALESCE\(\s*"Chat"\."agentActiveAt" >/);
    assert.match(text, /false\s*\)/);
  });

  it("counts a recent agent append as live", () => {
    const { sql: text, params } = chatActivityQuery().toSQL();
    assert.match(text, /"Chat"\."agentActiveAt" > now\(\)/);
    assert.ok(params.includes(AGENT_ACTIVE_MS / 1000));
  });

  it("reads the newest stream for the outcome", () => {
    const { sql: text } = chatActivityQuery().toSQL();
    assert.match(text, /ORDER BY s\."createdAt" DESC/);
    assert.match(text, /LIMIT 1/);
  });
});
