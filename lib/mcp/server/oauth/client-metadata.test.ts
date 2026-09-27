import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClientIdMetadataDocumentUrl,
  parseClientMetadata,
  validateClientIdMetadataDocument,
} from "./client-metadata";

const CLAUDE_CODE_CIMD_URL =
  "https://claude.ai/oauth/claude-code-client-metadata";

/** The document Claude Code actually publishes, verbatim. */
const CLAUDE_CODE_DOCUMENT = {
  client_id: CLAUDE_CODE_CIMD_URL,
  client_name: "Claude Code",
  client_uri: "https://claude.ai",
  redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

function expectFailure(result: ReturnType<typeof parseClientMetadata>) {
  assert.equal(result.ok, false);
  return result as Extract<typeof result, { ok: false }>;
}

describe("registration requests", () => {
  it("accepts the document Claude Code publishes", () => {
    const result = parseClientMetadata(CLAUDE_CODE_DOCUMENT);
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.metadata.clientName, "Claude Code");
    assert.equal(result.metadata.tokenEndpointAuthMethod, "none");
    assert.deepEqual(
      result.metadata.redirectUris,
      CLAUDE_CODE_DOCUMENT.redirect_uris,
    );
  });

  it("defaults a client that omits grant, response and auth fields", () => {
    const result = parseClientMetadata({
      client_name: "Cursor",
      redirect_uris: ["https://cursor.com/cb"],
    });
    assert.ok(result.ok);
    assert.deepEqual(result.metadata.responseTypes, ["code"]);
    assert.equal(
      result.metadata.tokenEndpointAuthMethod,
      "client_secret_basic",
    );
  });

  it("always offers refresh tokens, even to a client that did not ask", () => {
    const result = parseClientMetadata({
      client_name: "Terse",
      redirect_uris: ["https://terse.test/cb"],
      grant_types: ["authorization_code"],
    });
    assert.ok(result.ok);
    assert.deepEqual(result.metadata.grantTypes, [
      "authorization_code",
      "refresh_token",
    ]);
  });

  it("names a client that registered without one", () => {
    const result = parseClientMetadata(
      { redirect_uris: ["https://anon.test/cb"] },
      { fallbackName: "Unnamed agent" },
    );
    assert.ok(result.ok);
    assert.equal(result.metadata.clientName, "Unnamed agent");
  });

  it("requires at least one redirect URI", () => {
    assert.equal(
      expectFailure(parseClientMetadata({ client_name: "X" })).error,
      "invalid_redirect_uri",
    );
    assert.equal(
      expectFailure(
        parseClientMetadata({ client_name: "X", redirect_uris: [] }),
      ).error,
      "invalid_redirect_uri",
    );
  });

  it("refuses plain http on a public host", () => {
    const result = expectFailure(
      parseClientMetadata({
        client_name: "X",
        redirect_uris: ["http://evil.test/cb"],
      }),
    );
    assert.equal(result.error, "invalid_redirect_uri");
  });

  it("caps the redirect list", () => {
    const many = Array.from({ length: 11 }, (_, i) => `https://x.test/cb${i}`);
    assert.equal(
      expectFailure(
        parseClientMetadata({ client_name: "X", redirect_uris: many }),
      ).error,
      "invalid_redirect_uri",
    );
  });

  it("refuses the client_credentials grant, which this server does not issue", () => {
    const result = expectFailure(
      parseClientMetadata({
        client_name: "Headless",
        redirect_uris: ["https://x.test/cb"],
        grant_types: ["client_credentials"],
      }),
    );
    assert.equal(result.error, "invalid_client_metadata");
    assert.match(result.description, /client_credentials/);
  });

  it("refuses an implicit-flow response type", () => {
    assert.equal(
      expectFailure(
        parseClientMetadata({
          client_name: "Old",
          redirect_uris: ["https://x.test/cb"],
          response_types: ["token"],
        }),
      ).error,
      "invalid_client_metadata",
    );
  });

  it("substitutes an auth method it cannot verify, rather than refusing", () => {
    const result = parseClientMetadata({
      client_name: "X",
      redirect_uris: ["https://x.test/cb"],
      token_endpoint_auth_method: "private_key_jwt",
    });
    assert.ok(result.ok);
    assert.equal(
      result.metadata.tokenEndpointAuthMethod,
      "client_secret_basic",
    );
  });

  it("drops a non-https client_uri rather than rejecting the client", () => {
    const result = parseClientMetadata({
      client_name: "X",
      redirect_uris: ["https://x.test/cb"],
      client_uri: "http://x.test",
      logo_uri: "javascript:alert(1)",
    });
    assert.ok(result.ok);
    assert.equal(result.metadata.clientUri, null);
    assert.equal(result.metadata.logoUri, null);
  });

  it("refuses a body that is not an object", () => {
    assert.equal(
      expectFailure(parseClientMetadata("nope")).error,
      "invalid_client_metadata",
    );
    assert.equal(
      expectFailure(parseClientMetadata([])).error,
      "invalid_client_metadata",
    );
  });
});

describe("client id metadata documents", () => {
  it("recognises an https URL with a path", () => {
    assert.equal(isClientIdMetadataDocumentUrl(CLAUDE_CODE_CIMD_URL), true);
  });

  it("does not mistake a bare origin or an issued id for one", () => {
    assert.equal(isClientIdMetadataDocumentUrl("https://claude.ai"), false);
    assert.equal(isClientIdMetadataDocumentUrl("https://claude.ai/"), false);
    assert.equal(isClientIdMetadataDocumentUrl("osmcp_client_abc123"), false);
    assert.equal(
      isClientIdMetadataDocumentUrl("http://claude.ai/oauth/x"),
      false,
    );
  });

  it("accepts the document when its client_id is the URL it came from", () => {
    const result = validateClientIdMetadataDocument({
      url: CLAUDE_CODE_CIMD_URL,
      document: CLAUDE_CODE_DOCUMENT,
    });
    assert.ok(result.ok);
    assert.equal(result.metadata.clientName, "Claude Code");
  });

  it("refuses a document that claims a different identity", () => {
    const result = expectFailure(
      validateClientIdMetadataDocument({
        url: CLAUDE_CODE_CIMD_URL,
        document: {
          ...CLAUDE_CODE_DOCUMENT,
          client_id: "https://evil.test/client.json",
        },
      }),
    );
    assert.match(result.description, /does not match the URL/);
  });

  it("refuses a document served from a URL that is not a valid CIMD location", () => {
    assert.equal(
      expectFailure(
        validateClientIdMetadataDocument({
          url: "https://claude.ai",
          document: CLAUDE_CODE_DOCUMENT,
        }),
      ).error,
      "invalid_client_metadata",
    );
  });

  it("still applies redirect URI rules to a fetched document", () => {
    const result = expectFailure(
      validateClientIdMetadataDocument({
        url: CLAUDE_CODE_CIMD_URL,
        document: {
          ...CLAUDE_CODE_DOCUMENT,
          redirect_uris: ["http://evil.test/cb"],
        },
      }),
    );
    assert.equal(result.error, "invalid_redirect_uri");
  });
});

describe("grant and response types a client cannot use here", () => {
  it("registers Claude, which advertises jwt-bearer it will never use here", () => {
    const result = parseClientMetadata({
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      grant_types: [
        "authorization_code",
        "refresh_token",
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      ],
      response_types: ["code"],
    });
    assert.ok(result.ok);
    assert.deepEqual(result.metadata.grantTypes, [
      "authorization_code",
      "refresh_token",
    ]);
  });

  it("drops an extra response type rather than refusing the client", () => {
    const result = parseClientMetadata({
      client_name: "Implicit-curious",
      redirect_uris: ["https://implicit.test/cb"],
      response_types: ["code", "token"],
    });
    assert.ok(result.ok);
    assert.deepEqual(result.metadata.responseTypes, ["code"]);
  });

  it("still refuses a client that asked for nothing this server issues", () => {
    const result = expectFailure(
      parseClientMetadata({
        client_name: "Machine",
        redirect_uris: ["https://machine.test/cb"],
        grant_types: ["client_credentials"],
      }),
    );
    assert.match(result.description, /client_credentials/);
  });

  it("refuses a client that can only do implicit", () => {
    const result = expectFailure(
      parseClientMetadata({
        client_name: "Implicit-only",
        redirect_uris: ["https://implicit.test/cb"],
        response_types: ["token"],
      }),
    );
    assert.match(result.description, /code/);
  });
});

describe("an auth method this server cannot do", () => {
  it("registers a DCR client asking for private_key_jwt, with a secret", () => {
    const result = parseClientMetadata({
      client_name: "ChatGPT",
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
      token_endpoint_auth_method: "private_key_jwt",
    });
    assert.ok(result.ok);
    assert.equal(
      result.metadata.tokenEndpointAuthMethod,
      "client_secret_basic",
    );
  });

  it("falls a CIMD client back to none, because it holds no secret", () => {
    const result = parseClientMetadata(
      {
        client_name: "Public",
        redirect_uris: ["https://public.test/cb"],
        token_endpoint_auth_method: "client_secret_jwt",
      },
      { unsupportedAuthMethodFallback: "none" },
    );
    assert.ok(result.ok);
    assert.equal(result.metadata.tokenEndpointAuthMethod, "none");
  });

  it("keeps a method this server does support", () => {
    const result = parseClientMetadata({
      client_name: "Post",
      redirect_uris: ["https://post.test/cb"],
      token_endpoint_auth_method: "client_secret_post",
    });
    assert.ok(result.ok);
    assert.equal(result.metadata.tokenEndpointAuthMethod, "client_secret_post");
  });
});

describe("a client that registers one redirect URI we cannot honour", () => {
  it("keeps the rest instead of refusing the client", () => {
    const result = parseClientMetadata({
      client_name: "Mixed",
      redirect_uris: [
        "javascript:alert(1)",
        "https://mixed.test/cb",
        "http://127.0.0.1/cb",
      ],
    });
    assert.ok(result.ok);
    assert.deepEqual(result.metadata.redirectUris, [
      "https://mixed.test/cb",
      "http://127.0.0.1/cb",
    ]);
  });

  it("refuses when none of them are usable", () => {
    const result = expectFailure(
      parseClientMetadata({
        client_name: "Hostile",
        redirect_uris: ["javascript:alert(1)", "data:text/html,x"],
      }),
    );
    assert.equal(result.error, "invalid_redirect_uri");
  });
});
