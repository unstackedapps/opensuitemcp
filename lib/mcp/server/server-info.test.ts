import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMcpServerInfo, MCP_SERVER_TITLE } from "./server-info";

const ORIGIN = "https://netsuite.acme.com";
const info = buildMcpServerInfo({ origin: ORIGIN, version: "5.5.0" });

describe("server identity", () => {
  it("keeps the protocol name clients key their config off", () => {
    assert.equal(info.name, "opensuitemcp");
  });

  it("gives a display title, so a client stops inventing one", () => {
    assert.equal(info.title, MCP_SERVER_TITLE);
    assert.notEqual(info.title, info.name);
  });

  it("points at this install rather than a project site", () => {
    assert.equal(info.websiteUrl, ORIGIN);
  });

  it("offers an icon that carries its own background", () => {
    assert.deepEqual(info.icons, [
      {
        src: `${ORIGIN}/apple-icon`,
        mimeType: "image/png",
        sizes: ["180x180"],
      },
    ]);
  });

  it("derives every url from the origin it was given", () => {
    const other = buildMcpServerInfo({
      origin: "https://sandbox.example",
      version: "1.0.0",
    });
    for (const url of [other.websiteUrl, other.icons[0].src]) {
      assert.ok(url.startsWith("https://sandbox.example"), url);
    }
  });

  it("carries the version it was given", () => {
    assert.equal(info.version, "5.5.0");
  });
});
