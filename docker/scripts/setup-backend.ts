#!/usr/bin/env tsx
/**
 * Interactive local backend setup (TUI).
 * Replaces bash read prompts with @clack/prompts for cross-platform installs.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  password,
  select,
  spinner,
  text,
} from "@clack/prompts";
import {
  backupExistingEnvLocal,
  clearShellEnvConflicts,
  createSetupConfig,
  getSetupCompletionUrl,
  type InstallMode,
  isValidEmail,
  listShellEnvConflicts,
  logStaleSessionCookieHint,
  openBrowserUrl,
  sanitizeProjectName,
  writeSetupEnvFiles,
} from "./setup-backend-lib";
import { formatOpenSuiteMcpBanner } from "./setup-banner";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "../..");
const ENV_LOCAL_PATH = path.join(PROJECT_ROOT, ".env.local");
const COMPOSE_FILE = path.join(PROJECT_ROOT, "docker", "docker-compose.yml");
const COMPOSE_ENV_FILE = path.join(PROJECT_ROOT, "docker", ".env");

const isUserCancel = (value: unknown): value is symbol => isCancel(value);

const unwrapPrompt = <T>(value: T | symbol): T => {
  if (isUserCancel(value)) {
    exitCancel();
  }
  return value as T;
};

const exitCancel = (): never => {
  cancel("Setup cancelled.");
  process.exit(0);
};

const isDockerRunning = (): boolean => {
  const result = spawnSync("docker", ["info"], {
    stdio: "ignore",
  });
  return result.status === 0;
};

const runCompose = (projectName: string, args: string[]): boolean => {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      COMPOSE_ENV_FILE,
      "-f",
      COMPOSE_FILE,
      "-p",
      projectName,
      ...args,
    ],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      env: process.env,
    },
  );
  return result.status === 0;
};

async function promptProjectName(defaultName: string): Promise<string> {
  const nameChoice = unwrapPrompt(
    await select({
      message: "Docker Compose project name",
      options: [
        {
          value: "default",
          label: `Use default (${defaultName})`,
          hint: "Recommended for local dev",
        },
        {
          value: "custom",
          label: "Enter a custom name",
        },
      ],
      initialValue: "default",
    }),
  );

  if (nameChoice === "default") {
    return defaultName;
  }

  const custom = unwrapPrompt(
    await text({
      message: "Custom project name",
      placeholder: defaultName,
      validate: (value) => {
        if (!value?.trim()) {
          return "Enter a project name or cancel and pick the default.";
        }
        return undefined;
      },
    }),
  );

  return sanitizeProjectName(custom, defaultName);
}

async function promptInstallMode(): Promise<InstallMode> {
  const mode = await select({
    message: "Install mode",
    options: [
      {
        value: "org" as const,
        label: "Organization",
        hint: "Team install — /setup then onboarding wizard",
      },
      {
        value: "solo" as const,
        label: "Solo",
        hint: "Individual self-host — register/login",
      },
    ],
    initialValue: "org",
  });

  return unwrapPrompt(mode) as InstallMode;
}

async function promptOrgDetails(): Promise<{
  rootEmail: string;
  netsuiteAccountId: string;
  netsuiteOidcClientId: string;
}> {
  const configureOidc = unwrapPrompt(
    await confirm({
      message: "Configure NetSuite OIDC sign-in now?",
      initialValue: false,
    }),
  );

  let netsuiteAccountId = "";
  let netsuiteOidcClientId = "";

  if (configureOidc) {
    netsuiteAccountId = unwrapPrompt(
      await text({
        message: "NetSuite account ID",
        placeholder: "1234567",
        validate: (value) => {
          if (!value?.trim()) {
            return "Account ID is required when configuring OIDC.";
          }
          return undefined;
        },
      }),
    );

    netsuiteOidcClientId = unwrapPrompt(
      await password({
        message: "NetSuite OIDC client ID",
        validate: (value) => {
          if (!value?.trim()) {
            return "Client ID is required when configuring OIDC.";
          }
          return undefined;
        },
      }),
    );
  }

  note(
    configureOidc
      ? "Use the NetSuite account email for the user who will sign in on /setup. It must match their NetSuite login email exactly."
      : "Use the NetSuite account email for the org owner. It must match their NetSuite login email when you enable OIDC on /setup.",
    "Org owner email",
  );

  const rootEmail = unwrapPrompt(
    await text({
      message: "Org owner email (OSMCP_ROOT_EMAIL)",
      placeholder: "netsuite-user@yourcompany.com",
      validate: (value) => {
        if (!value || !isValidEmail(value)) {
          return "Enter a valid email address.";
        }
        return undefined;
      },
    }),
  );

  return { rootEmail, netsuiteAccountId, netsuiteOidcClientId };
}

async function promptOpenBrowser(installMode: InstallMode): Promise<void> {
  const url = getSetupCompletionUrl(installMode);
  const shouldOpen = unwrapPrompt(
    await confirm({
      message: `Open ${url} in your browser to complete setup?`,
      initialValue: true,
    }),
  );

  if (!shouldOpen) {
    return;
  }

  const opened = openBrowserUrl(url);
  if (!opened) {
    log.warn(`Could not open a browser automatically. Visit ${url} manually.`);
  }
}

async function completeSetup(
  installMode: InstallMode,
  message: string,
): Promise<void> {
  if (!process.env.OSMCP_SKIP_BROWSER_PROMPT) {
    await promptOpenBrowser(installMode);
  }
  outro(message);
}

async function main(): Promise<void> {
  console.log(`\n${formatOpenSuiteMcpBanner()}\n`);
  intro("Local backend setup");

  const defaultProjectName = sanitizeProjectName(
    path.basename(PROJECT_ROOT),
    "opensuitemcp",
  );

  let hadExistingEnv = false;
  if (existsSync(ENV_LOCAL_PATH)) {
    const overwrite = unwrapPrompt(
      await confirm({
        message: ".env.local already exists. Overwrite it?",
        initialValue: false,
      }),
    );

    if (!overwrite) {
      cancel("Existing .env.local preserved.");
      process.exit(0);
    }

    hadExistingEnv = backupExistingEnvLocal(PROJECT_ROOT);
    log.info("Backed up .env.local → .env.local.backup");
  }

  const projectName = await promptProjectName(defaultProjectName);
  const installMode = await promptInstallMode();

  let rootEmail = "";
  let netsuiteAccountId = "";
  let netsuiteOidcClientId = "";

  if (installMode === "org") {
    const orgDetails = await promptOrgDetails();
    rootEmail = orgDetails.rootEmail;
    netsuiteAccountId = orgDetails.netsuiteAccountId;
    netsuiteOidcClientId = orgDetails.netsuiteOidcClientId;
  }

  const config = createSetupConfig({
    projectName,
    installMode,
    rootEmail,
    netsuiteAccountId,
    netsuiteOidcClientId,
  });

  const setupSpinner = spinner();
  setupSpinner.start("Generating secrets and writing env files");

  writeSetupEnvFiles(PROJECT_ROOT, config);

  setupSpinner.stop(".env.local and docker/.env created");

  if (hadExistingEnv) {
    logStaleSessionCookieHint();
  }

  const shellConflicts = listShellEnvConflicts(process.env);
  if (shellConflicts.length > 0) {
    log.warn("Clearing stale shell env overrides in this process:");
    for (const conflict of shellConflicts) {
      log.message(`  ${conflict.name}=${conflict.masked}`);
    }
    clearShellEnvConflicts(process.env);
  }

  if (!existsSync(COMPOSE_FILE)) {
    log.warn("docker/docker-compose.yml not found — skipping Docker.");
    await completeSetup(
      installMode,
      "Run pnpm db:migrate and pnpm dev when ready.",
    );
    return;
  }

  if (!isDockerRunning()) {
    log.warn("Docker is not running — skipping containers.");
    note(
      "Start Docker Desktop, then run:\n  docker compose --env-file docker/.env -f docker/docker-compose.yml -p " +
        `${projectName} up -d`,
      "Next steps",
    );
    await completeSetup(installMode, "Env files are ready.");
    return;
  }

  const startDocker = unwrapPrompt(
    await confirm({
      message: "Start Docker containers now?",
      initialValue: true,
    }),
  );

  if (!startDocker) {
    note(
      `docker compose --env-file docker/.env -f docker/docker-compose.yml -p ${projectName} up -d`,
      "Start containers later with",
    );
    await completeSetup(installMode, "Backend env is configured.");
    return;
  }

  const buildSpinner = spinner();
  buildSpinner.start("Building SearXNG image (may take a minute)");
  const buildOk = runCompose(projectName, ["build", "searxng"]);
  if (!buildOk) {
    buildSpinner.stop("SearXNG build failed");
    log.error("Check Docker logs and retry compose build.");
    process.exit(1);
  }
  buildSpinner.stop("SearXNG image built");

  const upSpinner = spinner();
  upSpinner.start("Starting containers");
  const upOk = runCompose(projectName, ["up", "-d"]);
  upSpinner.stop(
    upOk ? "Containers started" : "Some containers may have failed",
  );

  if (!upOk) {
    log.warn(`Check status: docker compose -p ${projectName} ps`);
  }

  note(
    [
      "pnpm install   (if needed)",
      "pnpm skills:sync",
      "pnpm db:migrate",
      "pnpm dev  — or pnpm bootstrap:local to run skills + migrate + dev",
    ].join("\n"),
    "Next",
  );

  await completeSetup(
    installMode,
    installMode === "org"
      ? "Org setup is ready — finish bootstrap at /setup after migrate."
      : "Solo setup is ready — sign in at /login after migrate.",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error(message);
  process.exit(1);
});
