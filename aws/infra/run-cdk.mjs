import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const infraDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

createRequire(import.meta.url)("./load-env.cjs");
process.env.CDK_DISABLE_CLI_TELEMETRY = "1";

const needsDocker = args.some((arg) =>
  ["deploy", "bootstrap", "publish"].includes(arg),
);

if (needsDocker) {
  const dockerOk = await run("docker", ["info"], {
    stdio: "ignore",
    reject: false,
  });
  if (dockerOk !== 0) {
    console.error(
      "Docker is not running. Start Docker Desktop, then retry: pnpm cdk deploy",
    );
    process.exit(1);
  }
}

if (!existsSync(join(infraDir, "node_modules", "aws-cdk"))) {
  console.log("Installing CDK dependencies in aws/infra/ …");
  const installCode = await run("pnpm", ["install"], {
    cwd: infraDir,
    shell: true,
  });
  if (installCode !== 0) {
    process.exit(installCode);
  }
}

const cdkBin = join(infraDir, "node_modules", "aws-cdk", "bin", "cdk");
const cdkArgs = args.length > 0 ? args : ["--help"];
const skipsEnvCheck = cdkArgs.every((arg) =>
  ["--help", "-h", "docs"].includes(arg),
);

if (!skipsEnvCheck) {
  const missing = ["DOMAIN_NAME", "HOSTED_ZONE_NAME", "HOSTED_ZONE_ID"].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (!hasAwsCredentials()) {
    missing.unshift("AWS_PROFILE");
  }
  if (missing.length > 0) {
    console.error(
      `Missing ${missing.join(", ")}. Copy aws/infra/.env.example to aws/infra/.env.`,
    );
    process.exit(1);
  }
}

process.exit(
  await run(process.execPath, [cdkBin, ...cdkArgs], {
    cwd: infraDir,
  }),
);

function hasAwsCredentials() {
  return Boolean(
    process.env.AWS_PROFILE?.trim() ||
      process.env.AWS_ACCESS_KEY_ID?.trim() ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE?.trim() ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim() ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI?.trim(),
  );
}

function run(command, commandArgs, options = {}) {
  const {
    cwd = process.cwd(),
    stdio = "inherit",
    reject = true,
    shell = false,
  } = options;
  return new Promise((resolve, rejectPromise) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: process.env,
      shell,
      stdio,
      windowsHide: true,
    });
    child.on("error", (error) => {
      if (reject) {
        rejectPromise(error);
        return;
      }
      resolve(1);
    });
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}
