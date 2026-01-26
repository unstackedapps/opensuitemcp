import { tool } from "ai";
import { z } from "zod";
import {
  buildSearchConfig,
  getSearchDomainStatus,
  getSearchDomainUrl,
  searchDomains,
} from "@/lib/ai/search-domains";

type ListSearchDomainsOptions = {
  selectedDomainIds?: string[] | null;
  environment?: string;
};

export type ListSearchDomainsToolResult = {
  enabledDomainIds: string[];
  domains: {
    id: string;
    label: string;
    description: string;
    url: string;
    provider: string;
    tier: string;
    status: string;
    enabled: boolean;
  }[];
};

export function createListSearchDomainsTool(options: ListSearchDomainsOptions) {
  const searchConfig = buildSearchConfig({
    selectedDomainIds: options.selectedDomainIds,
    environment: options.environment,
  });

  return tool({
    description:
      "List the web search domains that Ava can access. Use this before searching to understand what sources are available.",
    inputSchema: z.object({}),
    execute: (): ListSearchDomainsToolResult => {
      const domains = searchDomains.map((domain) => {
        const status = getSearchDomainStatus(domain, searchConfig);
        const enabled = searchConfig.enabledDomainIds.has(domain.id);

        return {
          id: domain.id,
          label: domain.label,
          description: domain.description,
          url: getSearchDomainUrl(domain),
          provider: domain.provider,
          tier: domain.tier,
          status,
          enabled,
        };
      });

      return {
        enabledDomainIds: Array.from(searchConfig.enabledDomainIds),
        domains,
      };
    },
  });
}
