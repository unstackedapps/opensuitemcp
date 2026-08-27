/**
 * Cross-platform bootstrap / reset for local dev.
 * Interactive setup uses @clack/prompts (setup-backend.ts); teardown stays bash.
 * Node runs skills, migrate, and dev via process.execPath.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cancel, confirm, isCancel, log, spinner } from "@clack/prompts";
import {
  getSetupCompletionUrl,
  logStaleSessionCookieHint,
  openBrowserUrl,
  readInstallModeFromEnvLocal,
} from "./setup-backend-lib";

const require = createRequire(import.meta.url);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "../..");

const TSX_CLI = path.join(
  path.dirname(require.resolve("tsx/package.json")),
  "dist",
  "cli.mjs",
);
const NEXT_CLI = require.resolve("next/dist/bin/next");

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const exitWithError = (message: string, code = 1): never => {
  process.stderr.write(`${message}\n`);
  process.exit(code);
};

const runTsxScript = (
  relativePath: string,
  extraEnv?: Record<string, string>,
): void => {
  const scriptPath = path.join(PROJECT_ROOT, relativePath);
  const result = spawnSync(process.execPath, [TSX_CLI, scriptPath], {
    cwd: PROJECT_ROOT,
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    stdio: "inherit",
  });

  if (result.error) {
    exitWithError(`Failed to run ${relativePath}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const isUserCancel = (value: unknown): value is symbol => isCancel(value);

const unwrapPrompt = <T>(value: T | symbol): T => {
  if (isUserCancel(value)) {
    cancel("Bootstrap cancelled.");
    process.exit(0);
  }
  return value as T;
};

const waitForDevServer = async (
  url: string,
  timeoutMs = 120_000,
): Promise<boolean> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // Server still starting.
    }
    await sleep(500);
  }

  return false;
};

const spawnDevServer = (): ChildProcess => {
  const child = spawn(process.execPath, [NEXT_CLI, "dev"], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    exitWithError(`Failed to start dev server: ${error.message}`);
  });

  return child;
};

const waitForDevExit = (child: ChildProcess): Promise<never> =>
  new Promise(() => {
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
  });

const promptOpenBrowserAfterBootstrap = async (): Promise<boolean> => {
  const installMode = readInstallModeFromEnvLocal(PROJECT_ROOT);
  const url = getSetupCompletionUrl(installMode);

  return unwrapPrompt(
    await confirm({
      message: `Open ${url} in your browser to complete setup?`,
      initialValue: true,
    }),
  );
};

const runDevServerWithOptionalBrowser = async (): Promise<void> => {
  const shouldOpenBrowser = await promptOpenBrowserAfterBootstrap();
  const devChild = spawnDevServer();

  if (shouldOpenBrowser) {
    const devSpinner = spinner();
    devSpinner.start("Starting dev server");
    const ready = await waitForDevServer("http://localhost:3000");
    devSpinner.stop(
      ready
        ? "Dev server is ready"
        : "Dev server is taking longer than expected",
    );

    if (ready) {
      const url = getSetupCompletionUrl(
        readInstallModeFromEnvLocal(PROJECT_ROOT),
      );
      const opened = openBrowserUrl(url);
      if (!opened) {
        log.warn(
          `Could not open a browser automatically. Visit ${url} manually.`,
        );
      }
    } else {
      log.warn(
        "Open http://localhost:3000 manually once the dev server finishes starting.",
      );
    }
  }

  await waitForDevExit(devChild);
};

const runNodeSteps = async (): Promise<void> => {
  runTsxScript("lib/ai/skills/cli-sync-oracle.ts");
  runTsxScript("lib/db/migrate.ts");
  await runDevServerWithOptionalBrowser();
};

const bootstrap = async (): Promise<void> => {
  runTsxScript("docker/scripts/setup-backend.ts", {
    OSMCP_SKIP_BROWSER_PROMPT: "1",
  });
  await runNodeSteps();
};

const reset = async (): Promise<void> => {
  const teardownPath = path.join(SCRIPT_DIR, "teardown-backend.sh");
  const teardown = spawnSync("bash", [teardownPath], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: "inherit",
  });
  if (teardown.error) {
    exitWithError(`Failed to run teardown: ${teardown.error.message}`);
  }
  if (teardown.status !== 0) {
    process.exit(teardown.status ?? 1);
  }
  process.stdout.write("\n⏳ Waiting for Docker to release volumes...\n");
  await sleep(3000);
  process.stdout.write("\n🚀 Re-running local bootstrap...\n");
  runTsxScript("docker/scripts/setup-backend.ts", {
    OSMCP_SKIP_BROWSER_PROMPT: "1",
  });
  logStaleSessionCookieHint();
  await runNodeSteps();
};

const command = process.argv[2];

if (command === "bootstrap") {
  bootstrap().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    exitWithError(message);
  });
} else if (command === "reset") {
  reset().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    exitWithError(message);
  });
} else {
  exitWithError(
    "Usage: tsx docker/scripts/local-orchestrator.ts <bootstrap|reset>",
  );
}
