export type SearchProvider = "searxng";

export type SearchDomainTier = "included" | "premium" | "coming-soon";

export type SearchDomain = {
  id: string;
  label: string;
  description: string;
  hostname: string;
  path?: string;
  provider: SearchProvider;
  tier: SearchDomainTier;
  defaultIncluded?: boolean;
  tags?: string[];
  keywords?: string[];
};

/** Catalog of web search domains for the Settings "Web Search Tools" toggles and get_current_config. */
export const searchDomains: SearchDomain[] = [
  {
    id: "oracle-netsuite-help",
    label: "Oracle NetSuite Help Center",
    description:
      "Official Oracle NetSuite documentation, guides, and help topics.",
    hostname: "docs.oracle.com",
    path: "en/cloud/saas/netsuite",
    provider: "searxng",
    tier: "included",
    defaultIncluded: true,
    tags: ["oracle", "netsuite", "help", "official"],
    keywords: ["oracle netsuite", "suiteanswers", "netsuite help"],
  },
  {
    id: "tim-dietrich-blog",
    label: "Tim Dietrich Knowledge Base",
    description:
      "Deep-dive NetSuite development blogs, tutorials and SuiteQL examples from Tim Dietrich.",
    hostname: "timdietrich.me",
    path: "blog",
    provider: "searxng",
    tier: "included",
    tags: ["blog", "netsuite", "suiteql"],
    keywords: ["tim dietrich", "timdietrich", "dietrich", "tim's blog"],
  },
  {
    id: "folio3-netsuite-blog",
    label: "Folio3 Knowledge Base",
    description:
      "NetSuite blogs and articles by Folio3 from netsuite.folio3.com/blog.",
    hostname: "netsuite.folio3.com",
    path: "blog",
    provider: "searxng",
    tier: "included",
    tags: ["blog", "netsuite", "folio3"],
    keywords: ["folio3", "folio 3", "netsuite folio3", "folio3 blog"],
  },
];

const TRAILING_SLASH_REGEX = /\/+$/;

export function getSearchDomainUrl(domain: SearchDomain): string {
  const path = domain.path ? domain.path.replace(TRAILING_SLASH_REGEX, "") : "";
  const normalizedPath = path ? `/${path}` : "";
  return `https://${domain.hostname}${normalizedPath}`;
}
