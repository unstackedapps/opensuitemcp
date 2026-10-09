import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  ORACLE_HELP_CATALOG_ID,
  searchResourceSiteFilter,
  searchResultUrlInResource,
} from "./search-resources";
import { executeSearXNGDomainSearch } from "./web-search";

const HELP_URL = "https://docs.oracle.com/en/cloud/saas/netsuite/";
const HELP_PAGE =
  "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1111031232.html";

// What SearXNG returned through Bing on 2026-10-09 for a Ship Central query.
const SHIP_CENTRAL_RESULTS = [
  { url: "https://www.shiphelp.org/", title: "SHIP Help" },
  { url: "https://en.wikipedia.org/wiki/Ship", title: "Ship - Wikipedia" },
  {
    url: "https://acl.gov/programs/connecting-people-services/state-health-insurance-assistance-program-ship",
    title: "State Health Insurance Assistance Program (SHIP)",
  },
  {
    url: HELP_PAGE,
    title: "Installing the SuiteApps for NetSuite Ship Central",
  },
  {
    url: "https://www.netsuite.com/portal/products.shtml",
    title: "NetSuite Products",
  },
  {
    url: "https://docs.cloud.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N3395142.html",
    title: "Installing a Bundle",
  },
  {
    url: "https://docs.oracle.com/en/database/oracle/oracle-database/index.html",
    title: "Oracle Database",
  },
].map((result) => ({ ...result, content: "", engine: "bing" }));

function searxng(results: unknown[]) {
  const urls: string[] = [];
  const fetchImpl = ((url: string) => {
    urls.push(url);
    return Promise.resolve(Response.json({ results }));
  }) as typeof fetch;
  return { fetchImpl, urls };
}

function searchHelpCenter(
  fetchImpl: typeof fetch,
  overrides: { query?: string; maxResults?: number } = {},
) {
  return executeSearXNGDomainSearch({
    siteFilter: searchResourceSiteFilter(HELP_URL),
    domainId: ORACLE_HELP_CATALOG_ID,
    domainLabel: "Oracle NetSuite Help Center",
    domainUrl: HELP_URL,
    query: overrides.query ?? "Ship Central SuiteApp install",
    maxResults: overrides.maxResults ?? 10,
    fetchImpl,
  });
}

describe("executeSearXNGDomainSearch", () => {
  beforeEach(() => {
    process.env.SEARXNG_ENDPOINT = "http://searxng.test";
    mock.method(console, "log", () => undefined);
    mock.method(console, "warn", () => undefined);
  });
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns only Oracle NetSuite Help Center pages", async () => {
    const { fetchImpl } = searxng(SHIP_CENTRAL_RESULTS);
    const result = await searchHelpCenter(fetchImpl);
    assert.deepEqual(
      result.results.map((entry) => entry.url),
      [
        HELP_PAGE,
        "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N3395142.html",
      ],
    );
  });

  it("counts maxResults after dropping other sites", async () => {
    const { fetchImpl } = searxng(SHIP_CENTRAL_RESULTS);
    const result = await searchHelpCenter(fetchImpl, { maxResults: 1 });
    assert.deepEqual(
      result.results.map((entry) => entry.url),
      [HELP_PAGE],
    );
  });

  it("returns nothing when no result is in the Help Center", async () => {
    const { fetchImpl } = searxng(SHIP_CENTRAL_RESULTS.slice(0, 3));
    const result = await searchHelpCenter(fetchImpl);
    assert.deepEqual(result.results, []);
  });

  it("names NetSuite in the query, since Bing ignores site:", async () => {
    const { fetchImpl, urls } = searxng([]);
    await searchHelpCenter(fetchImpl, { query: "File Cabinet $& Add File" });
    assert.equal(
      new URL(urls[0]).searchParams.get("q"),
      "site:docs.oracle.com/en/cloud/saas/netsuite NetSuite File Cabinet $& Add File Oracle Help Center",
    );
  });

  it("leaves a custom resource's query as typed", async () => {
    const { fetchImpl, urls } = searxng([
      { url: "https://example.com/post", title: "Post", content: "" },
      { url: "https://elsewhere.com/post", title: "Elsewhere", content: "" },
    ]);
    const result = await executeSearXNGDomainSearch({
      siteFilter: "site:example.com",
      domainId: "custom-1",
      domainLabel: "Example",
      domainUrl: "https://example.com/",
      query: "saved search",
      maxResults: 5,
      fetchImpl,
    });
    assert.equal(
      new URL(urls[0]).searchParams.get("q"),
      "site:example.com saved search",
    );
    assert.deepEqual(
      result.results.map((entry) => entry.url),
      ["https://example.com/post"],
    );
  });
});

describe("searchResultUrlInResource", () => {
  const mirrors = ["docs.cloud.oracle.com"];

  it("keeps a page under the resource path", () => {
    assert.equal(searchResultUrlInResource(HELP_PAGE, HELP_URL), HELP_PAGE);
  });

  it("drops a path that only shares a prefix", () => {
    assert.equal(
      searchResultUrlInResource(
        "https://docs.oracle.com/en/cloud/saas/netsuite-other/page.html",
        HELP_URL,
      ),
      null,
    );
  });

  it("drops another host", () => {
    assert.equal(
      searchResultUrlInResource("https://en.wikipedia.org/wiki/Ship", HELP_URL),
      null,
    );
  });

  it("moves a mirror host's page onto the resource host", () => {
    assert.equal(
      searchResultUrlInResource(
        "http://docs.cloud.oracle.com/en/cloud/saas/netsuite/ns-online-help/a.html",
        HELP_URL,
        mirrors,
      ),
      "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/a.html",
    );
  });

  it("checks a mirror host's path too", () => {
    assert.equal(
      searchResultUrlInResource(
        "https://docs.cloud.oracle.com/iaas/Content/home.htm",
        HELP_URL,
        mirrors,
      ),
      null,
    );
  });

  it("keeps a subdomain of a host-only resource", () => {
    assert.equal(
      searchResultUrlInResource(
        "https://blog.example.com/post",
        "https://example.com",
      ),
      "https://blog.example.com/post",
    );
  });

  it("drops a host that only ends with the resource's name", () => {
    assert.equal(
      searchResultUrlInResource(
        "https://notexample.com/post",
        "https://example.com",
      ),
      null,
    );
  });

  it("drops a URL that is not http", () => {
    assert.equal(
      searchResultUrlInResource(
        "ftp://docs.oracle.com/en/cloud/saas/netsuite/a.html",
        HELP_URL,
      ),
      null,
    );
    assert.equal(searchResultUrlInResource("not a url", HELP_URL), null);
  });
});
