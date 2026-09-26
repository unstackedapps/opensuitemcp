import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildConnectClients } from "./connect-clients";

const SERVER = "https://netsuite.acme.com/api/mcp";
const clients = buildConnectClients(SERVER);

describe("connect guide", () => {
  it("covers every client the docs promise", () => {
    assert.deepEqual(
      clients.map((client) => client.id),
      [
        "claude",
        "claude-code",
        "cursor",
        "vscode",
        "gemini-cli",
        "chatgpt",
        "other",
      ],
    );
  });

  it("offers an agent key everywhere, since sign-in is not always possible", () => {
    for (const client of clients) {
      assert.ok(client.agentKey.snippet, `${client.id} needs a key snippet`);
    }
  });

  it("puts the real server URL in every sign-in snippet", () => {
    for (const client of clients) {
      const code = client.signIn?.snippet?.code;
      assert.ok(code, `${client.id} needs a sign-in snippet`);
      assert.ok(
        code.includes(SERVER) || code.includes(new URL(SERVER).origin),
        `${client.id} sign-in snippet should name the server`,
      );
    }
  });

  it("names the credential in every agent-key snippet", () => {
    for (const client of clients) {
      const code = client.agentKey.snippet?.code ?? "";
      assert.match(
        code,
        /osmcp_/,
        `${client.id} key snippet should show the key`,
      );
    }
  });

  it("gives Gemini CLI httpUrl, because url would mean SSE", () => {
    const gemini = clients.find((client) => client.id === "gemini-cli");
    assert.ok(gemini?.signIn?.snippet?.code.includes('"httpUrl"'));
    assert.ok(!gemini?.signIn?.snippet?.code.includes('"url"'));
  });

  it("gives VS Code servers and Cursor mcpServers", () => {
    const vscode = clients.find((client) => client.id === "vscode");
    const cursor = clients.find((client) => client.id === "cursor");
    assert.ok(vscode?.signIn?.snippet?.code.includes('"servers"'));
    assert.ok(cursor?.signIn?.snippet?.code.includes('"mcpServers"'));
  });

  it("marks which clients run on a vendor's servers", () => {
    const vendor = clients.filter((client) => client.runsOn === "vendor");
    assert.deepEqual(
      vendor.map((client) => client.id),
      ["claude", "chatgpt"],
    );
  });

  it("emits valid JSON in every json snippet", () => {
    for (const client of clients) {
      for (const method of [client.signIn, client.agentKey]) {
        if (method?.snippet?.language === "json") {
          assert.doesNotThrow(
            () => JSON.parse(method.snippet?.code ?? ""),
            `${client.id} json snippet must parse`,
          );
        }
      }
    }
  });
});
