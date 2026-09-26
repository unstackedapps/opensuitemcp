import { MCP_SERVER_NAME } from "./config";

/**
 * What this server says it is.
 *
 * Revision 2025-11-25 let a server describe itself rather than be described:
 * `title` for display, `description` for a subtitle, `icons` for a picture, and
 * `websiteUrl` for somewhere to click through to. Returning only `name` and
 * `version` left every client to invent the rest — which is how an install
 * comes to be listed as "Opensuitemcp", title-cased from a lowercase protocol
 * identifier that was never meant to be read by anyone.
 *
 * Older revisions ignore the extra fields, so they are sent unconditionally
 * rather than switched on the negotiated version.
 *
 * Everything is derived from the install's own origin. A self-hosted install
 * points at itself, not at a project site belonging to somebody else's
 * deployment.
 */

export const MCP_SERVER_TITLE = "OpenSuiteMCP";

export const MCP_SERVER_DESCRIPTION =
  "Work inside a NetSuite workspace as the person who authorized this agent — their connected account, their permissions, their tool policy.";

/**
 * The icon a client displays.
 *
 * /apple-icon rather than /icon.svg: it carries its own dark background, so a
 * client that composites it onto a tile of its own gets the logo on the
 * backdrop it was drawn for instead of on whatever that client happens to use.
 * It is served unauthenticated — a client fetching an icon has no session.
 */
const ICON_PATH = "/apple-icon";
const ICON_SIZE = "180x180";

export type McpServerIcon = {
  src: string;
  mimeType: string;
  sizes: string[];
};

export type McpServerInfo = {
  name: string;
  title: string;
  version: string;
  description: string;
  websiteUrl: string;
  icons: McpServerIcon[];
};

export function buildMcpServerInfo(params: {
  origin: string;
  version: string;
}): McpServerInfo {
  return {
    // The protocol identifier stays as it is: clients key configuration off it.
    name: MCP_SERVER_NAME,
    title: MCP_SERVER_TITLE,
    version: params.version,
    description: MCP_SERVER_DESCRIPTION,
    websiteUrl: params.origin,
    icons: [
      {
        src: `${params.origin}${ICON_PATH}`,
        mimeType: "image/png",
        sizes: [ICON_SIZE],
      },
    ],
  };
}
