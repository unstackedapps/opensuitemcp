import { isProductionEnvironment } from "@/lib/constants";

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

export const searchDomains: SearchDomain[] = [
  {
    id: "oracle-netsuite-help",
    label: "Oracle NetSuite Help Center",
    description:
      "Official Oracle NetSuite documentation, guides, and help topics.",
    hostname: "docs.oracle.com",
    path: "en/cloud",
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
    provider: "searxng",
    tier: "included",
    tags: ["blog", "netsuite", "suiteql"],
    keywords: ["tim dietrich", "timdietrich", "dietrich", "tim's blog"],
  },
];

export const DEFAULT_SEARCH_DOMAIN_ID =
  searchDomains.find((domain) => domain.defaultIncluded)?.id ??
  searchDomains.at(0)?.id ??
  "oracle-netsuite-help";

export const ADVANCED_WEB_SEARCH_DOMAIN_IDS = searchDomains
  .filter((domain) => domain.tier === "premium")
  .map((domain) => domain.id);

export function getSearchDomainById(id: string): SearchDomain | undefined {
  return searchDomains.find((domain) => domain.id === id);
}

const TRAILING_SLASH_REGEX = /\/+$/;

export function getSearchDomainUrl(domain: SearchDomain): string {
  const path = domain.path ? domain.path.replace(TRAILING_SLASH_REGEX, "") : "";
  const normalizedPath = path ? `/${path}` : "";
  return `https://${domain.hostname}${normalizedPath}`;
}

export type SearchConfig = {
  environment: string;
  defaultDomain: SearchDomain;
  enabledDomains: SearchDomain[];
  enabledDomainIds: Set<string>;
  lockedDomainIds: Set<string>;
  domainsById: Map<string, SearchDomain>;
};

export function buildSearchConfig({
  selectedDomainIds,
  environment,
}: {
  selectedDomainIds?: string[] | null;
  environment?: string;
}): SearchConfig {
  const resolvedEnvironment =
    environment ?? (isProductionEnvironment ? "production" : "development");

  const domainsById = new Map<string, SearchDomain>();
  for (const domain of searchDomains) {
    domainsById.set(domain.id, domain);
  }

  const defaultDomain =
    domainsById.get(DEFAULT_SEARCH_DOMAIN_ID) ??
    searchDomains.at(0) ??
    searchDomains[0];

  const enabledDomainIds = new Set<string>();
  const lockedDomainIds = new Set<string>();

  const selectedIds = new Set(selectedDomainIds ?? []);

  // Only include domains that are explicitly in the selected list
  // If no domains are selected, web search will be unavailable
  for (const id of selectedIds) {
    const domain = domainsById.get(id);
    if (!domain) {
      continue;
    }
    if (domain.tier === "coming-soon") {
      continue;
    }
    if (domain.tier === "premium" && resolvedEnvironment === "production") {
      lockedDomainIds.add(domain.id);
      continue;
    }
    enabledDomainIds.add(domain.id);
  }

  const enabledDomains = searchDomains.filter((domain) =>
    enabledDomainIds.has(domain.id),
  );

  return {
    environment: resolvedEnvironment,
    defaultDomain,
    enabledDomains,
    enabledDomainIds,
    lockedDomainIds,
    domainsById,
  };
}

export type SearchDomainStatus =
  | "enabled"
  | "available"
  | "locked"
  | "coming-soon";

export function getSearchDomainStatus(
  domain: SearchDomain,
  config: SearchConfig,
): SearchDomainStatus {
  if (domain.tier === "coming-soon") {
    return "coming-soon";
  }
  if (config.enabledDomainIds.has(domain.id)) {
    return "enabled";
  }
  if (config.lockedDomainIds.has(domain.id)) {
    return "locked";
  }
  return "available";
}
