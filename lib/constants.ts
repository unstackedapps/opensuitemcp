import { generateDummyPassword } from "./db/utils";

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT,
);

export const guestRegex = /^guest-\d+$/;

/** Canonical product docs — not shipped inside self-hosted app instances. */
export const PUBLIC_DOCS_ORIGIN = "https://opensuitemcp.com";
export const NETSUITE_INTEGRATION_DOCS_URL = `${PUBLIC_DOCS_ORIGIN}/docs/netsuite-integration`;

export const DUMMY_PASSWORD = generateDummyPassword();
