import {
  builtinSearchResource,
  ORACLE_HELP_CATALOG_ID,
} from "@/lib/ai/search-resources";
import { createSearchResourceTool } from "@/lib/ai/tools/search-web-resource";

type SearchNetsuiteDocsOptions = {
  fetchImpl?: typeof fetch;
};

export function createSearchNetsuiteDocsTool(
  options: SearchNetsuiteDocsOptions = {},
) {
  const builtin = builtinSearchResource(ORACLE_HELP_CATALOG_ID);
  return createSearchResourceTool(
    {
      id: ORACLE_HELP_CATALOG_ID,
      catalogId: ORACLE_HELP_CATALOG_ID,
      label: builtin?.label ?? "Oracle NetSuite Help Center",
      url: builtin?.url ?? "https://docs.oracle.com/en/cloud/saas/netsuite",
      enabled: true,
    },
    options,
  );
}
