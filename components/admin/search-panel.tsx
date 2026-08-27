"use client";

import { SearchResourcesAdminSection } from "@/components/admin/search-resources-admin-section";
import type { OrgSearchResourceRow } from "@/lib/org/search-resources";

type SearchPanelProps = {
  resources: OrgSearchResourceRow[];
};

export function SearchPanel({ resources }: SearchPanelProps) {
  return (
    <SearchResourcesAdminSection
      panelTitle="Web Search"
      resources={resources}
    />
  );
}
