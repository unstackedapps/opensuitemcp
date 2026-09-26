import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readClientCredentials } from "./client-auth";

function basic(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`, "utf8").toString("base64")}`;
}

describe("client authentication", () => {
  it("reads HTTP Basic credentials", () => {
    assert.deepEqual(
      readClientCredentials({
        authorization: basic("osmcp_client_abc", "osmcp_csec_xyz"),
        form: new URLSearchParams(),
      }),
      { clientId: "osmcp_client_abc", clientSecret: "osmcp_csec_xyz" },
    );
  });

  it("form-urldecodes both halves, so a colon in a secret survives", () => {
    assert.deepEqual(
      readClientCredentials({
        authorization: basic("id", encodeURIComponent("a:b")),
        form: new URLSearchParams(),
      }),
      { clientId: "id", clientSecret: "a:b" },
    );
  });

  it("falls back to the request body", () => {
    assert.deepEqual(
      readClientCredentials({
        authorization: null,
        form: new URLSearchParams({
          client_id: "osmcp_client_abc",
          client_secret: "s",
        }),
      }),
      { clientId: "osmcp_client_abc", clientSecret: "s" },
    );
  });

  it("prefers the header when a client sends both", () => {
    const result = readClientCredentials({
      authorization: basic("from-header", "h"),
      form: new URLSearchParams({ client_id: "from-body", client_secret: "b" }),
    });
    assert.equal(result.clientId, "from-header");
  });

  it("accepts a public client that sends an id and no secret", () => {
    assert.deepEqual(
      readClientCredentials({
        authorization: null,
        form: new URLSearchParams({
          client_id: "https://claude.ai/oauth/x.json",
        }),
      }),
      { clientId: "https://claude.ai/oauth/x.json", clientSecret: null },
    );
  });

  it("ignores a bearer header, which is not client authentication", () => {
    assert.deepEqual(
      readClientCredentials({
        authorization: "Bearer osmcp_at_x",
        form: new URLSearchParams({ client_id: "body" }),
      }),
      { clientId: "body", clientSecret: null },
    );
  });

  it("returns nulls when nothing was sent", () => {
    assert.deepEqual(
      readClientCredentials({
        authorization: null,
        form: new URLSearchParams(),
      }),
      { clientId: null, clientSecret: null },
    );
  });
});
