import { isAllowedRedirectUriShape } from "./redirect-uri";

/**
 * Client metadata validation, shared by both registration paths.
 *
 * A client arrives here one of three ways, and the metadata it carries is the
 * same document in every case:
 *
 *   - **Client ID Metadata Document** — the `client_id` is an HTTPS URL we
 *     fetch. Preferred by revision 2026-07-28 and by Claude Code.
 *   - **Dynamic Client Registration** — the client POSTs the document to
 *     `/api/oauth/register`. Deprecated by that revision, still what Cursor and
 *     VS Code do, so it stays.
 *   - **Pre-registration** — a person fills the same fields in the App Portal
 *     and pastes the resulting id and secret into a connector's advanced
 *     settings.
 *
 * Validation is identical across all three. Only the transport differs.
 */

export type TokenEndpointAuthMethod =
  | "none"
  | "client_secret_post"
  | "client_secret_basic";

export const SUPPORTED_GRANT_TYPES = ["authorization_code", "refresh_token"];
export const SUPPORTED_RESPONSE_TYPES = ["code"];
export const SUPPORTED_AUTH_METHODS: TokenEndpointAuthMethod[] = [
  "none",
  "client_secret_post",
  "client_secret_basic",
];

const MAX_REDIRECT_URIS = 10;
const MAX_NAME_LENGTH = 128;
const MAX_URI_LENGTH = 2048;

export type ClientMetadata = {
  clientName: string;
  clientUri: string | null;
  logoUri: string | null;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  scope: string | null;
  softwareId: string | null;
};

export type ClientMetadataFailure = {
  /** An RFC 7591 section 3.2.2 error code. */
  error: "invalid_redirect_uri" | "invalid_client_metadata";
  description: string;
};

export type ClientMetadataResult =
  | { ok: true; metadata: ClientMetadata }
  | ({ ok: false } & ClientMetadataFailure);

function fail(
  error: ClientMetadataFailure["error"],
  description: string,
): ClientMetadataResult {
  return { ok: false, error, description };
}

function readString(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    return null;
  }
  return trimmed;
}

function readHttpsUri(value: unknown): string | null {
  const raw = readString(value, MAX_URI_LENGTH);
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: string[] = [];
  for (const entry of value) {
    const str = readString(entry, MAX_URI_LENGTH);
    if (!str) {
      return null;
    }
    out.push(str);
  }
  return out;
}

/**
 * Validate a client metadata document.
 *
 * `fallbackName` covers a document that omits `client_name`: DCR makes the
 * field optional, and a nameless client on a consent screen is worse than one
 * labelled by its own registration.
 */
export function parseClientMetadata(
  body: unknown,
  options: { fallbackName?: string } = {},
): ClientMetadataResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(
      "invalid_client_metadata",
      "The request body must be a JSON object.",
    );
  }
  const doc = body as Record<string, unknown>;

  const redirectUris = readStringArray(doc.redirect_uris);
  if (!redirectUris || redirectUris.length === 0) {
    return fail(
      "invalid_redirect_uri",
      "At least one redirect_uris entry is required.",
    );
  }
  if (redirectUris.length > MAX_REDIRECT_URIS) {
    return fail(
      "invalid_redirect_uri",
      `At most ${MAX_REDIRECT_URIS} redirect URIs may be registered.`,
    );
  }
  for (const uri of redirectUris) {
    if (!isAllowedRedirectUriShape(uri)) {
      return fail(
        "invalid_redirect_uri",
        `${uri} is not usable: a redirect URI must be https, or http on a loopback address, and must not carry a fragment.`,
      );
    }
  }

  const clientName =
    readString(doc.client_name, MAX_NAME_LENGTH) ??
    options.fallbackName ??
    null;
  if (!clientName) {
    return fail("invalid_client_metadata", "client_name is required.");
  }

  const grantTypes =
    doc.grant_types === undefined
      ? ["authorization_code"]
      : readStringArray(doc.grant_types);
  if (!grantTypes || grantTypes.length === 0) {
    return fail(
      "invalid_client_metadata",
      "grant_types must be an array of strings.",
    );
  }
  const unsupportedGrant = grantTypes.find(
    (grant) => !SUPPORTED_GRANT_TYPES.includes(grant),
  );
  if (unsupportedGrant) {
    return fail(
      "invalid_client_metadata",
      `Grant type ${unsupportedGrant} is not supported. This server issues ${SUPPORTED_GRANT_TYPES.join(" and ")} only.`,
    );
  }

  const responseTypes =
    doc.response_types === undefined
      ? ["code"]
      : readStringArray(doc.response_types);
  if (
    !responseTypes ||
    responseTypes.some((t) => !SUPPORTED_RESPONSE_TYPES.includes(t))
  ) {
    return fail(
      "invalid_client_metadata",
      'response_types must be ["code"]; this server supports the authorization code flow only.',
    );
  }

  const rawAuthMethod = doc.token_endpoint_auth_method;
  const tokenEndpointAuthMethod =
    rawAuthMethod === undefined ? "client_secret_basic" : rawAuthMethod;
  if (
    typeof tokenEndpointAuthMethod !== "string" ||
    !SUPPORTED_AUTH_METHODS.includes(
      tokenEndpointAuthMethod as TokenEndpointAuthMethod,
    )
  ) {
    return fail(
      "invalid_client_metadata",
      `token_endpoint_auth_method must be one of ${SUPPORTED_AUTH_METHODS.join(", ")}.`,
    );
  }

  return {
    ok: true,
    metadata: {
      clientName,
      clientUri: readHttpsUri(doc.client_uri),
      logoUri: readHttpsUri(doc.logo_uri),
      redirectUris,
      // A client that asks only for authorization_code still gets refresh
      // tokens offered; withholding them would force a fresh consent every
      // hour, and the client is free to ignore one it did not ask for.
      grantTypes: Array.from(new Set([...grantTypes, "refresh_token"])),
      responseTypes,
      tokenEndpointAuthMethod:
        tokenEndpointAuthMethod as TokenEndpointAuthMethod,
      scope: readString(doc.scope, MAX_NAME_LENGTH),
      softwareId: readString(doc.software_id, MAX_NAME_LENGTH),
    },
  };
}

/**
 * Is this `client_id` a Client ID Metadata Document URL rather than an id we issued?
 *
 * The draft requires the https scheme and a path component, which is what keeps
 * a bare origin from being mistaken for one.
 */
export function isClientIdMetadataDocumentUrl(clientId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(clientId.trim());
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.pathname !== "/" &&
    parsed.pathname.length > 1 &&
    !parsed.hash
  );
}

/**
 * Validate a fetched Client ID Metadata Document against the URL it came from.
 *
 * The `client_id` inside must equal that URL exactly. Without that check a
 * document could claim any identity it liked, and the URL — the only thing we
 * actually verified by fetching it — would stop meaning anything.
 */
export function validateClientIdMetadataDocument(params: {
  url: string;
  document: unknown;
}): ClientMetadataResult {
  if (!isClientIdMetadataDocumentUrl(params.url)) {
    return fail(
      "invalid_client_metadata",
      "A Client ID Metadata Document URL must use https and contain a path component.",
    );
  }
  if (!params.document || typeof params.document !== "object") {
    return fail(
      "invalid_client_metadata",
      "The metadata document is not a JSON object.",
    );
  }

  const declared = (params.document as Record<string, unknown>).client_id;
  if (typeof declared !== "string" || declared.trim() !== params.url.trim()) {
    return fail(
      "invalid_client_metadata",
      "The document's client_id does not match the URL it was fetched from.",
    );
  }

  return parseClientMetadata(params.document);
}
