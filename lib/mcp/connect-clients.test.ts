import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildConnectClients } from "./connect-clients";

const SERVER = "https://netsuite.acme.com/api/mcp";
const clients = buildConnectClients(SERVER);

describe("connect guide", () => {
  it("covers every client the docs promise", () => {
    assert.deepEqual(
      clients.map((client) => client.id),
      ["claude", "cursor", "gemini", "chatgpt", "other"],
    );
  });

  it("offers a bearer token wherever the client can send a header", () => {
    for (const client of clients) {
      if (!client.agentKey) {
        continue;
      }
      assert.ok(client.agentKey.snippet, `${client.id} needs a key snippet`);
    }
  });

  it("gives Gemini no bearer route, because custom apps take no headers", () => {
    const gemini = clients.find((client) => client.id === "gemini");
    assert.equal(gemini?.agentKey, null);
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
      const code = client.agentKey?.snippet?.code ?? "";
      if (!client.agentKey) {
        continue;
      }
      assert.match(
        code,
        /osmcp_/,
        `${client.id} key snippet should show the key`,
      );
    }
  });

  it("gives Cursor mcpServers, the key its mcp.json reads", () => {
    const cursor = clients.find((client) => client.id === "cursor");
    assert.ok(cursor?.signIn?.snippet?.code.includes('"mcpServers"'));
  });

  it("marks which clients run on a vendor's servers", () => {
    const vendor = clients.filter((client) => client.runsOn === "vendor");
    assert.deepEqual(
      vendor.map((client) => client.id),
      ["claude", "gemini", "chatgpt"],
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
