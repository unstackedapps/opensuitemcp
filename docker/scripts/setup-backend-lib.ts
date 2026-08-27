import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type InstallMode = "org" | "solo";

export type SetupConfig = {
  projectName: string;
  installMode: InstallMode;
  rootEmail: string;
  netsuiteAccountId: string;
  netsuiteOidcClientId: string;
  postgresPassword: string;
  redisPassword: string;
  authSecret: string;
  encryptionKey: string;
};

const ENV_CONFLICT_VARS = [
  "POSTGRES_URL",
  "DATABASE_URL",
  "REDIS_URL",
  "AUTH_SECRET",
  "ENCRYPTION_KEY",
  "NEXTAUTH_URL",
] as const;

export function sanitizeProjectName(raw: string, fallback: string): string {
  const sanitized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!sanitized) {
    return fallback;
  }
  return sanitized;
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.includes("@") && trimmed.includes(".");
}

export function generateSecret(length: number): string {
  return randomBytes(length)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length);
}

export function buildEnvLocalContent(config: SetupConfig): string {
  const lines = [
    "# Database",
    `POSTGRES_URL="postgresql://postgres:${config.postgresPassword}@localhost:5432/${config.projectName}"`,
    "",
    "# Redis",
    `REDIS_URL="redis://:${config.redisPassword}@localhost:6379"`,
    "",
    "# Authentication",
    `AUTH_SECRET="${config.authSecret}"`,
    "",
    "# Encryption (for user API keys)",
    `ENCRYPTION_KEY="${config.encryptionKey}"`,
    "",
    "# Application",
    'NEXTAUTH_URL="http://localhost:3000"',
    "",
    "# Install mode (org = /setup bootstrap, solo = register/login)",
    `OSMCP_INSTALL_MODE="${config.installMode}"`,
  ];

  if (config.installMode === "org") {
    lines.push(
      "",
      "# Org owner bootstrap — NetSuite account email; must match OIDC sign-in user on /setup",
      `OSMCP_ROOT_EMAIL="${config.rootEmail.trim()}"`,
    );

    if (config.netsuiteAccountId && config.netsuiteOidcClientId) {
      lines.push(
        "",
        "# Optional NetSuite OIDC login (or configure in onboarding)",
        `OSMCP_NS_ACCOUNT_ID="${config.netsuiteAccountId.trim()}"`,
        `OSMCP_NS_OIDC_CLIENT_ID="${config.netsuiteOidcClientId.trim()}"`,
      );
    }
  }

  lines.push(
    "",
    "# Guest auto-login is disabled by default. Enable only for e2e/demo:",
    '# OSMCP_ENABLE_GUEST="true"',
    "",
    "# SearXNG",
    'SEARXNG_ENDPOINT="http://localhost:8080"',
    "",
  );

  return `${lines.join("\n")}\n`;
}

export function buildComposeEnvContent(config: SetupConfig): string {
  return [
    `PROJECT_NAME=${config.projectName}`,
    `POSTGRES_PW=${config.postgresPassword}`,
    `REDIS_PW=${config.redisPassword}`,
    "",
  ].join("\n");
}

export function writeSetupEnvFiles(
  projectRoot: string,
  config: SetupConfig,
): { envLocalPath: string; composeEnvPath: string } {
  const envLocalPath = path.join(projectRoot, ".env.local");
  const composeEnvPath = path.join(projectRoot, "docker", ".env");

  writeFileSync(envLocalPath, buildEnvLocalContent(config), "utf8");

  mkdirSync(path.dirname(composeEnvPath), { recursive: true });
  writeFileSync(composeEnvPath, buildComposeEnvContent(config), "utf8");

  return { envLocalPath, composeEnvPath };
}

export function backupExistingEnvLocal(projectRoot: string): boolean {
  const envLocalPath = path.join(projectRoot, ".env.local");
  if (!existsSync(envLocalPath)) {
    return false;
  }
  copyFileSync(envLocalPath, `${envLocalPath}.backup`);
  return true;
}

export function maskEnvValue(value: string): string {
  if (value.length <= 8) {
    return `(set, ${value.length} chars)`;
  }
  return `${value.slice(0, 24)}… (${value.length} chars)`;
}

export function listShellEnvConflicts(
  env: NodeJS.ProcessEnv,
): Array<{ name: string; masked: string }> {
  const conflicts: Array<{ name: string; masked: string }> = [];
  for (const name of ENV_CONFLICT_VARS) {
    const value = env[name];
    if (value) {
      conflicts.push({ name, masked: maskEnvValue(value) });
    }
  }
  return conflicts;
}

export function clearShellEnvConflicts(env: NodeJS.ProcessEnv): string[] {
  const cleared: string[] = [];
  for (const name of ENV_CONFLICT_VARS) {
    if (env[name]) {
      cleared.push(name);
      delete env[name];
    }
  }
  return cleared;
}

export function createSetupConfig(input: {
  projectName: string;
  installMode: InstallMode;
  rootEmail?: string;
  netsuiteAccountId?: string;
  netsuiteOidcClientId?: string;
}): SetupConfig {
  return {
    projectName: input.projectName,
    installMode: input.installMode,
    rootEmail: input.rootEmail?.trim() ?? "",
    netsuiteAccountId: input.netsuiteAccountId?.trim() ?? "",
    netsuiteOidcClientId: input.netsuiteOidcClientId?.trim() ?? "",
    postgresPassword: generateSecret(24),
    redisPassword: generateSecret(24),
    authSecret: randomBytes(32).toString("base64"),
    encryptionKey: randomBytes(32).toString("base64"),
  };
}

const DEFAULT_APP_URL = "http://localhost:3000";

export function getSetupCompletionUrl(
  installMode: InstallMode,
  baseUrl = DEFAULT_APP_URL,
): string {
  if (installMode === "org") {
    return `${baseUrl}/setup`;
  }
  return `${baseUrl}/login`;
}

export function readInstallModeFromEnvLocal(projectRoot: string): InstallMode {
  const envLocalPath = path.join(projectRoot, ".env.local");
  if (!existsSync(envLocalPath)) {
    return "org";
  }

  const content = readFileSync(envLocalPath, "utf8");
  const match = content.match(/^OSMCP_INSTALL_MODE="(org|solo)"/m);
  return match?.[1] === "solo" ? "solo" : "org";
}

export const STALE_SESSION_COOKIE_HINT =
  "A new AUTH_SECRET was written. Clear localhost cookies or visit /api/auth/signout if you see session errors.";

export function logStaleSessionCookieHint(): void {
  console.log(`\nℹ️  ${STALE_SESSION_COOKIE_HINT}\n`);
}

export function openBrowserUrl(url: string): boolean {
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  const result = spawnSync(command, args, {
    stdio: "ignore",
  });
  return result.status === 0;
}
