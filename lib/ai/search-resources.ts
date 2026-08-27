export const ORACLE_HELP_CATALOG_ID = "oracle-netsuite-help";
export const MAX_SEARCH_RESOURCES = 16;

export type SearchResourceEntry = {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  catalogId?: string | null;
  managedByOrg?: boolean;
  orgDisabled?: boolean;
};

export const BUILTIN_SEARCH_RESOURCES: Array<{
  catalogId: string;
  label: string;
  url: string;
  toolDescription: string;
}> = [
  {
    catalogId: ORACLE_HELP_CATALOG_ID,
    label: "Oracle NetSuite Help Center",
    url: "https://docs.oracle.com/en/cloud/saas/netsuite",
    toolDescription:
      "Official Oracle NetSuite Help Center. Use this for foundational truth, standard UI navigation, permission setup, official SuiteScript API references, and security best practices. Priority 1 for 'How-to' questions regarding native features and core ERP modules.",
  },
];

const TRAILING_SLASH_REGEX = /\/+$/;
const LEADING_SLASH_REGEX = /^\/+/;
const HAS_PROTOCOL_REGEX = /^https?:\/\//i;

export function builtinSearchResource(
  catalogId: string,
): (typeof BUILTIN_SEARCH_RESOURCES)[number] | undefined {
  return BUILTIN_SEARCH_RESOURCES.find((item) => item.catalogId === catalogId);
}

export function isSeededSearchResource(resource: {
  catalogId?: string | null;
  url?: string;
}): boolean {
  if (resource.catalogId && builtinSearchResource(resource.catalogId)) {
    return true;
  }
  if (!resource.url) {
    return false;
  }
  try {
    const url = normalizeSearchResourceUrl(resource.url);
    return BUILTIN_SEARCH_RESOURCES.some((item) => item.url === url);
  } catch {
    return BUILTIN_SEARCH_RESOURCES.some((item) => item.url === resource.url);
  }
}

function applySeededSearchResourceDefaults(
  resource: SearchResourceEntry,
): SearchResourceEntry {
  const builtin = resource.catalogId
    ? builtinSearchResource(resource.catalogId)
    : BUILTIN_SEARCH_RESOURCES.find((item) => {
        try {
          return item.url === normalizeSearchResourceUrl(resource.url);
        } catch {
          return item.url === resource.url;
        }
      });
  if (!builtin) {
    return resource;
  }
  return {
    ...resource,
    catalogId: builtin.catalogId,
    label: builtin.label,
    url: builtin.url,
  };
}

export function ensureSeededSearchResources(
  resources: SearchResourceEntry[],
  options?: { enableNewSeeds?: (catalogId: string) => boolean },
): SearchResourceEntry[] {
  const next = resources.map(applySeededSearchResourceDefaults);
  const present = new Set(
    next
      .map((item) => item.catalogId)
      .filter((catalogId): catalogId is string => Boolean(catalogId)),
  );
  const added: SearchResourceEntry[] = [];
  for (const item of BUILTIN_SEARCH_RESOURCES) {
    if (present.has(item.catalogId)) {
      continue;
    }
    added.push({
      id: item.catalogId,
      label: item.label,
      url: item.url,
      enabled: options?.enableNewSeeds?.(item.catalogId) === true,
      catalogId: item.catalogId,
    });
  }

  const seeds = [
    ...added,
    ...next.filter((item) => isSeededSearchResource(item)),
  ];
  const custom = next.filter((item) => !isSeededSearchResource(item));
  return [...seeds, ...custom];
}

export function normalizeSearchResourceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("URL is required.");
  }

  const withProtocol = HAS_PROTOCOL_REGEX.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Use an https URL.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error("Enter a valid URL.");
  }

  const path = parsed.pathname
    .replace(TRAILING_SLASH_REGEX, "")
    .replace(LEADING_SLASH_REGEX, "");

  return path ? `https://${hostname}/${path}` : `https://${hostname}`;
}

export function searchResourceSiteFilter(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname
    .replace(TRAILING_SLASH_REGEX, "")
    .replace(LEADING_SLASH_REGEX, "");
  return path ? `site:${parsed.hostname}/${path}` : `site:${parsed.hostname}`;
}

export function searchResourceToolName(resource: SearchResourceEntry): string {
  if (resource.catalogId === ORACLE_HELP_CATALOG_ID) {
    return "searchNetsuiteDocs";
  }
  return `searchWeb_${resource.id.replaceAll("-", "").slice(0, 16)}`;
}

export function searchResourceToolDescription(
  resource: SearchResourceEntry,
): string {
  const builtin = resource.catalogId
    ? builtinSearchResource(resource.catalogId)
    : undefined;
  if (builtin) {
    return builtin.toolDescription;
  }
  return `Search ${resource.label} (${resource.url}). Use this for how-to and documentation questions from this site.`;
}

export function hydrateSearchResources(params: {
  searchResources?: SearchResourceEntry[] | null;
  searchDomainIds?: string[] | null;
}): SearchResourceEntry[] {
  const existing = (params.searchResources ?? []).filter(
    (item) => item.id && item.label && item.url,
  );
  const enabledIds = new Set(params.searchDomainIds ?? []);
  const next: SearchResourceEntry[] = [];
  for (const item of existing) {
    try {
      next.push({
        ...item,
        url: normalizeSearchResourceUrl(item.url),
        enabled: item.enabled !== false,
        catalogId: item.catalogId ?? null,
      });
    } catch {
      next.push({
        ...item,
        enabled: item.enabled !== false,
        catalogId: item.catalogId ?? null,
      });
    }
  }

  return ensureSeededSearchResources(next, {
    enableNewSeeds: (catalogId) =>
      existing.length === 0 && enabledIds.has(catalogId),
  });
}

export function enabledSearchResourceIds(
  resources: SearchResourceEntry[],
): string[] {
  return resources
    .filter((item) => item.enabled)
    .map((item) => item.catalogId ?? item.id);
}

export function assertSearchResourceList(
  resources: SearchResourceEntry[],
): SearchResourceEntry[] {
  if (resources.length > MAX_SEARCH_RESOURCES) {
    throw new Error(`You can add up to ${MAX_SEARCH_RESOURCES} resources.`);
  }

  const urls = new Set<string>();
  const next: SearchResourceEntry[] = [];

  for (const resource of resources) {
    const pinned = applySeededSearchResourceDefaults({
      ...resource,
      id: resource.id.trim(),
      enabled: resource.enabled !== false,
      catalogId: resource.catalogId ?? null,
    });
    const label = pinned.label.trim();
    if (!label) {
      throw new Error("Label is required.");
    }
    if (label.length > 128) {
      throw new Error("Label must be 128 characters or less.");
    }

    const url = normalizeSearchResourceUrl(pinned.url);
    if (urls.has(url)) {
      throw new Error("That URL is already in the list.");
    }
    urls.add(url);

    next.push({
      id: pinned.id,
      label,
      url,
      enabled: pinned.enabled !== false,
      catalogId: pinned.catalogId ?? null,
    });
  }

  if (next.some((item) => !item.id)) {
    throw new Error("Each resource needs an id.");
  }

  for (const item of BUILTIN_SEARCH_RESOURCES) {
    if (next.some((resource) => resource.catalogId === item.catalogId)) {
      continue;
    }
    throw new Error(
      `${item.label} is a built-in resource and cannot be removed.`,
    );
  }

  return next;
}

export function mergeOrgSearchResourcesForUser(params: {
  orgResources: SearchResourceEntry[];
  userResources?: SearchResourceEntry[] | null;
}): SearchResourceEntry[] {
  const userById = new Map(
    (params.userResources ?? []).map((item) => [item.id, item]),
  );

  return params.orgResources.map((org) => {
    const orgDisabled = org.enabled === false;
    const user = userById.get(org.id);
    return {
      ...org,
      managedByOrg: true,
      orgDisabled,
      enabled: orgDisabled ? false : user?.enabled !== false,
    };
  });
}

export function overlayUserSearchResourceEnabled(params: {
  orgResources: SearchResourceEntry[];
  incoming: SearchResourceEntry[];
}): SearchResourceEntry[] {
  const orgIds = new Set(params.orgResources.map((item) => item.id));
  for (const item of params.incoming) {
    if (!orgIds.has(item.id)) {
      throw new Error("Unknown search resource.");
    }
  }

  const incomingById = new Map(params.incoming.map((item) => [item.id, item]));

  return params.orgResources.map((org) => {
    const orgDisabled = org.enabled === false;
    const incomingItem = incomingById.get(org.id);
    return {
      ...org,
      managedByOrg: true,
      orgDisabled,
      enabled: orgDisabled ? false : incomingItem?.enabled !== false,
    };
  });
}
