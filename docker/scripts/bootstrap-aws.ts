#!/usr/bin/env tsx
/**
 * Deploy OpenSuiteMCP to a new EC2 server (TUI), or remove one.
 *
 *   pnpm bootstrap:aws                 ask, create the server, install over SSH
 *   pnpm teardown:aws [--name NAME]    delete everything bootstrap:aws created
 *
 * It runs the AWS CLI steps in docs/deploy-aws.md and then deploy/install.sh
 * over SSH. What it creates is saved in ~/.opensuitemcp/aws/<name>.json after
 * each step, so a second run with the same name picks up where the first
 * stopped, and teardown knows what to delete.
 *
 * Every prompt has a flag, so it also runs unattended:
 *   pnpm bootstrap:aws --yes --name acme --mode org --root-email a@acme.com \
 *     [--domain osmcp.acme.com] [--profile osmcp] [--region us-east-1] \
 *     [--instance-type t3.medium] [--version 5.11.0]
 */
import { spawnSync } from "node:child_process";
import { promises as dns } from "node:dns";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import { isValidEmail } from "./setup-backend-lib";
import { formatOpenSuiteMcpBanner } from "./setup-banner";

const INSTALL_URL =
  "https://raw.githubusercontent.com/unstackedapps/opensuitemcp/main/deploy/install.sh";
const STATE_DIR = path.join(os.homedir(), ".opensuitemcp", "aws");
const UBUNTU_OWNER = "099720109477";
const UBUNTU_IMAGE =
  "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*";
const DNS_WAIT_MS = 30 * 60 * 1000;
const SSH_WAIT_MS = 5 * 60 * 1000;

type InstallMode = "org" | "solo";

/** Everything a deployment created, written after each step. */
type Deployment = {
  name: string;
  profile: string;
  region: string;
  accountId?: string;
  instanceType?: string;
  mode?: InstallMode;
  rootEmail?: string;
  /** Empty means <ip>.sslip.io. */
  domain?: string;
  version?: string;
  keyPath?: string;
  keyName?: string;
  securityGroupId?: string;
  instanceId?: string;
  allocationId?: string;
  publicIp?: string;
  installedAt?: string;
};

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "deploy";

function flag(name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}
const unattended = argv.includes("--yes");

// ---------------------------------------------------------------- prompts

const exitCancel = (message = "Cancelled."): never => {
  cancel(message);
  process.exit(0);
};

const unwrap = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    exitCancel();
  }
  return value as T;
};

const fail = (message: string): never => {
  log.error(message);
  process.exit(1);
};

// ---------------------------------------------------------------- state

const statePath = (name: string) => path.join(STATE_DIR, `${name}.json`);
const knownHostsPath = (name: string) =>
  path.join(STATE_DIR, `${name}.known_hosts`);

function loadState(name: string): Deployment | null {
  try {
    return JSON.parse(readFileSync(statePath(name), "utf8")) as Deployment;
  } catch {
    return null;
  }
}

function saveState(state: Deployment): void {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(statePath(state.name), `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
}

function listStates(): Deployment[] {
  if (!existsSync(STATE_DIR)) {
    return [];
  }
  return readdirSync(STATE_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => loadState(file.replace(/\.json$/, "")))
    .filter((state): state is Deployment => state !== null);
}

// ---------------------------------------------------------------- AWS CLI

const AWS_INSTALL_DOCS =
  "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html";

/** `aws login` needs a 2025 or later AWS CLI v2. */
function supportsLogin(bin: string): boolean {
  return spawnSync(bin, ["login", "help"], { stdio: "ignore" }).status === 0;
}

function cliVersion(bin: string): string {
  const out = spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout ?? "";
  return out.match(/aws-cli\/(\S+)/)?.[1] ?? "unknown";
}

/**
 * Every AWS CLI on this machine, first on PATH first. A Mac can carry two:
 * AWS's installer and Homebrew each add one, and the older may come first.
 */
function findAwsClis(): string[] {
  const onPath = (
    spawnSync("which", ["-a", "aws"], { encoding: "utf8" }).stdout ?? ""
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const known = [
    path.join(os.homedir(), ".local", "bin", "aws"),
    "/usr/local/bin/aws",
    "/opt/homebrew/bin/aws",
  ].filter((bin) => existsSync(bin));
  return [...new Set([...onPath, ...known])];
}

/** The commands that install or update the AWS CLI here, or null. */
function installCommands(): string[] | null {
  if (process.platform === "darwin") {
    return [
      "curl -fsSL https://awscli.amazonaws.com/AWSCLIV2.pkg -o /tmp/AWSCLIV2.pkg",
      "sudo installer -pkg /tmp/AWSCLIV2.pkg -target /",
    ];
  }
  if (process.platform === "linux") {
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
    return [
      `curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-${arch}.zip -o /tmp/awscliv2.zip`,
      "rm -rf /tmp/aws && unzip -q /tmp/awscliv2.zip -d /tmp",
      "sudo /tmp/aws/install --update",
    ];
  }
  return null;
}

let AWS = "aws";

/**
 * The first thing bootstrap:aws does. Finds an AWS CLI that has `aws login`,
 * and offers to install or update one when there is none.
 */
async function ensureAwsCli(): Promise<void> {
  const clis = findAwsClis();
  const ready = clis.find(supportsLogin);
  if (ready) {
    AWS = ready;
    log.success(`AWS CLI ${cliVersion(ready)}`);
    return;
  }

  const problem = clis[0]
    ? `AWS CLI ${cliVersion(clis[0])} is too old for aws login.`
    : "The AWS CLI isn't installed.";
  const commands = installCommands();
  if (!commands) {
    fail(`${problem} Install AWS CLI v2: ${AWS_INSTALL_DOCS}`);
  }
  note((commands as string[]).join("\n"), `${problem} AWS's installer:`);
  const install =
    !unattended &&
    unwrap(
      await confirm({
        message: clis[0]
          ? "Update it now? It asks for your password."
          : "Install it now? It asks for your password.",
      }),
    );
  if (!install) {
    outro("Run those commands, then pnpm bootstrap:aws again.");
    process.exit(1);
  }

  const ran = spawnSync("sh", ["-c", (commands as string[]).join(" && ")], {
    stdio: "inherit",
  });
  const installed = findAwsClis().find(supportsLogin);
  if (ran.status !== 0 || !installed) {
    fail(
      `The AWS CLI installer didn't finish. Install it by hand: ${AWS_INSTALL_DOCS}`,
    );
  }
  AWS = installed as string;
  log.success(`AWS CLI ${cliVersion(AWS)}`);
}

type AwsTarget = { profile: string; region: string };

function aws(target: AwsTarget, args: string[]) {
  const result = spawnSync(
    AWS,
    [
      ...args,
      "--profile",
      target.profile,
      "--region",
      target.region,
      "--output",
      "json",
      "--no-cli-pager",
    ],
    { encoding: "utf8" },
  );
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? result.error?.message ?? "",
  };
}

function awsJson<T>(target: AwsTarget, args: string[]): T {
  const result = aws(target, args);
  if (!result.ok) {
    throw new Error(
      result.stderr || `aws ${args.slice(0, 2).join(" ")} failed`,
    );
  }
  return (result.stdout ? JSON.parse(result.stdout) : {}) as T;
}

function tags(name: string, resource: string): string {
  return `ResourceType=${resource},Tags=[{Key=Name,Value=${name}},{Key=Project,Value=${name}},{Key=ManagedBy,Value=opensuitemcp-bootstrap}]`;
}

// ---------------------------------------------------------------- SSH

function sshArgs(state: Deployment): string[] {
  return [
    "-i",
    state.keyPath ?? "",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `UserKnownHostsFile=${knownHostsPath(state.name)}`,
    "-o",
    "ConnectTimeout=8",
    `ubuntu@${state.publicIp}`,
  ];
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// ---------------------------------------------------------------- deploy

async function chooseTarget(): Promise<AwsTarget & { name: string }> {
  const profiles = spawnSync(AWS, ["configure", "list-profiles"], {
    encoding: "utf8",
  })
    .stdout?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Each saved profile is a sign-in to some AWS account, possibly another
  // company's, so one is chosen from a list and never pre-filled into a field.
  let profile = flag("profile");
  if (!profile && (unattended || !profiles?.length)) {
    profile = "osmcp";
  }
  if (!profile) {
    const known = profiles ?? [];
    profile = unwrap(
      await select({
        message: "AWS CLI profile",
        initialValue: "osmcp",
        options: [
          ...(known.includes("osmcp")
            ? []
            : [
                {
                  value: "osmcp",
                  label: "New profile: osmcp",
                  hint: "signs in with aws login",
                },
              ]),
          ...known.map((saved) => ({ value: saved, label: saved })),
        ],
      }),
    );
  }

  const region =
    flag("region") ??
    (unattended
      ? "us-east-1"
      : unwrap(
          await text({
            message: "AWS region",
            placeholder: "us-east-1",
            defaultValue: "us-east-1",
          }),
        ));

  const name =
    flag("name") ??
    (unattended
      ? "opensuitemcp"
      : unwrap(
          await text({
            message: "Name for this server",
            placeholder: "opensuitemcp",
            defaultValue: "opensuitemcp",
            validate: (value) =>
              !value || /^[a-z0-9][a-z0-9-]{1,40}$/.test(value)
                ? undefined
                : "Lowercase letters, numbers and dashes",
          }),
        ));

  return { profile, region, name };
}

type Identity = { Account: string; Arn: string };

async function ensureSignedIn(target: AwsTarget): Promise<Identity> {
  const identity = aws(target, ["sts", "get-caller-identity"]);
  if (identity.ok) {
    return JSON.parse(identity.stdout) as Identity;
  }
  if (unattended) {
    fail(
      `The AWS CLI isn't signed in for profile ${target.profile}. Run: aws login --profile ${target.profile} --region ${target.region} --remote`,
    );
  }
  const signIn = unwrap(
    await confirm({
      message: `Profile ${target.profile} isn't signed in. Sign in with aws login now?`,
    }),
  );
  if (!signIn) {
    exitCancel();
  }
  spawnSync(
    AWS,
    [
      "login",
      "--profile",
      target.profile,
      "--region",
      target.region,
      "--remote",
    ],
    { stdio: "inherit" },
  );
  const retry = aws(target, ["sts", "get-caller-identity"]);
  if (!retry.ok) {
    fail(retry.stderr);
  }
  return JSON.parse(retry.stdout) as Identity;
}

/** Free plan accounts may only launch a short list of types. */
function defaultInstanceType(target: AwsTarget): string {
  const plan = aws(target, ["freetier", "get-account-plan-state"]);
  if (plan.ok && plan.stdout.includes('"FREE"')) {
    return "c7i-flex.large";
  }
  return "t3.medium";
}

async function askInstall(state: Deployment): Promise<void> {
  const typeDefault = defaultInstanceType(state);
  state.instanceType =
    flag("instance-type") ??
    state.instanceType ??
    (unattended
      ? typeDefault
      : unwrap(
          await select({
            message: "Instance type",
            initialValue: typeDefault,
            options: [
              { value: "t3.medium", label: "t3.medium", hint: "2 vCPU, 4 GB" },
              {
                value: "c7i-flex.large",
                label: "c7i-flex.large",
                hint: "2 vCPU, 4 GB · Free plan accounts",
              },
              {
                value: "m7i-flex.large",
                label: "m7i-flex.large",
                hint: "2 vCPU, 8 GB",
              },
            ],
          }),
        ));

  state.mode =
    (flag("mode") as InstallMode | undefined) ??
    state.mode ??
    (unattended
      ? fail("--mode org or --mode solo is required with --yes")
      : unwrap(
          await select<InstallMode>({
            message: "Install mode",
            options: [
              {
                value: "org",
                label: "Organization",
                hint: "one organization with an owner and admins",
              },
              { value: "solo", label: "Solo", hint: "individual accounts" },
            ],
          }),
        ));
  if (state.mode !== "org" && state.mode !== "solo") {
    fail("--mode must be org or solo");
  }

  if (state.mode === "org") {
    state.rootEmail =
      flag("root-email") ??
      state.rootEmail ??
      (unattended
        ? fail("--root-email is required with --mode org")
        : unwrap(
            await text({
              message: "Owner's NetSuite login email",
              validate: (value) =>
                value && isValidEmail(value) ? undefined : "Enter an email",
            }),
          ));
  }

  const domainFlag = flag("domain");
  state.domain =
    domainFlag ??
    state.domain ??
    (unattended
      ? ""
      : unwrap(
          await text({
            message: "Domain people will open",
            placeholder: "Leave blank to use <ip>.sslip.io",
            defaultValue: "",
            validate: (value) =>
              !value ||
              /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value.trim())
                ? undefined
                : "A domain such as osmcp.example.com",
          }),
        ));
  state.domain = state.domain.trim().toLowerCase();
  state.version = flag("version") ?? state.version;
}

function ensureKey(state: Deployment): void {
  state.keyPath ??= path.join(os.homedir(), ".ssh", state.name);
  state.keyName ??= state.name;
  if (!existsSync(state.keyPath)) {
    mkdirSync(path.dirname(state.keyPath), { recursive: true, mode: 0o700 });
    const made = spawnSync(
      "ssh-keygen",
      ["-q", "-t", "ed25519", "-f", state.keyPath, "-N", "", "-C", state.name],
      { stdio: "inherit" },
    );
    if (made.status !== 0) {
      fail(`ssh-keygen could not write ${state.keyPath}`);
    }
  }
  const existing = aws(state as AwsTarget, [
    "ec2",
    "describe-key-pairs",
    "--key-names",
    state.keyName,
    "--query",
    "KeyPairs[0].KeyFingerprint",
  ]);
  if (existing.ok) {
    // A key pair of this name that isn't ours would launch a server we
    // can't SSH into. AWS prints the SHA-256 base64 with padding.
    const local = spawnSync(
      "ssh-keygen",
      ["-lf", `${state.keyPath}.pub`, "-E", "sha256"],
      { encoding: "utf8" },
    )
      .stdout.split(" ")[1]
      ?.replace(/^SHA256:/, "");
    const remote = (JSON.parse(existing.stdout) as string).replace(/[=]+$/, "");
    if (local !== remote) {
      fail(
        `A key pair named ${state.keyName} already exists in this account with a different key. Choose another name.`,
      );
    }
  } else {
    awsJson(state as AwsTarget, [
      "ec2",
      "import-key-pair",
      "--key-name",
      state.keyName,
      "--public-key-material",
      `fileb://${state.keyPath}.pub`,
      "--tag-specifications",
      tags(state.name, "key-pair"),
    ]);
  }
}

async function ensureSecurityGroup(state: Deployment): Promise<void> {
  const target = state as AwsTarget;
  if (!state.securityGroupId) {
    const vpcs = awsJson<{ Vpcs: { VpcId: string }[] }>(target, [
      "ec2",
      "describe-vpcs",
      "--filters",
      "Name=is-default,Values=true",
    ]);
    const vpc = vpcs.Vpcs[0]?.VpcId;
    if (!vpc) {
      fail(
        `${state.region} has no default VPC. Create the server with the steps in docs/deploy-aws.md instead.`,
      );
    }
    const found = awsJson<{ SecurityGroups: { GroupId: string }[] }>(target, [
      "ec2",
      "describe-security-groups",
      "--filters",
      `Name=group-name,Values=${state.name}`,
      `Name=vpc-id,Values=${vpc}`,
    ]);
    state.securityGroupId =
      found.SecurityGroups[0]?.GroupId ??
      awsJson<{ GroupId: string }>(target, [
        "ec2",
        "create-security-group",
        "--group-name",
        state.name,
        "--description",
        "OpenSuiteMCP",
        "--vpc-id",
        vpc as string,
        "--tag-specifications",
        tags(state.name, "security-group"),
      ]).GroupId;
    saveState(state);
  }

  const myIp = (
    await (await fetch("https://checkip.amazonaws.com")).text()
  ).trim();
  const rules = [
    `IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${myIp}/32,Description=ssh}]`,
    "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]",
    "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]",
  ];
  for (const rule of rules) {
    const added = aws(target, [
      "ec2",
      "authorize-security-group-ingress",
      "--group-id",
      state.securityGroupId,
      "--ip-permissions",
      rule,
    ]);
    if (!(added.ok || added.stderr.includes("InvalidPermission.Duplicate"))) {
      fail(added.stderr);
    }
  }
}

function ensureInstance(state: Deployment): void {
  const target = state as AwsTarget;
  if (state.instanceId) {
    const current = aws(target, [
      "ec2",
      "describe-instances",
      "--instance-ids",
      state.instanceId,
      "--query",
      "Reservations[0].Instances[0].State.Name",
    ]);
    if (current.ok && !current.stdout.includes("terminated")) {
      return;
    }
  }
  const ami = awsJson<string>(target, [
    "ec2",
    "describe-images",
    "--owners",
    UBUNTU_OWNER,
    "--filters",
    `Name=name,Values=${UBUNTU_IMAGE}`,
    "Name=state,Values=available",
    "--query",
    "sort_by(Images,&CreationDate)[-1].ImageId",
  ]);
  state.instanceId = awsJson<string>(target, [
    "ec2",
    "run-instances",
    "--image-id",
    ami,
    "--instance-type",
    state.instanceType ?? "t3.medium",
    "--key-name",
    state.keyName ?? state.name,
    "--security-group-ids",
    state.securityGroupId ?? "",
    "--block-device-mappings",
    "DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3}",
    "--metadata-options",
    "HttpTokens=required",
    "--tag-specifications",
    tags(state.name, "instance"),
    tags(state.name, "volume"),
    "--query",
    "Instances[0].InstanceId",
  ]);
  saveState(state);
  const running = aws(target, [
    "ec2",
    "wait",
    "instance-running",
    "--instance-ids",
    state.instanceId,
  ]);
  if (!running.ok) {
    fail(running.stderr);
  }
}

function ensureAddress(state: Deployment): void {
  const target = state as AwsTarget;
  if (!state.allocationId) {
    state.allocationId = awsJson<string>(target, [
      "ec2",
      "allocate-address",
      "--domain",
      "vpc",
      "--tag-specifications",
      tags(state.name, "elastic-ip"),
      "--query",
      "AllocationId",
    ]);
    saveState(state);
  }
  awsJson(target, [
    "ec2",
    "associate-address",
    "--instance-id",
    state.instanceId ?? "",
    "--allocation-id",
    state.allocationId,
  ]);
  state.publicIp = awsJson<string>(target, [
    "ec2",
    "describe-addresses",
    "--allocation-ids",
    state.allocationId,
    "--query",
    "Addresses[0].PublicIp",
  ]);
  saveState(state);
}

async function waitForDns(domain: string, ip: string): Promise<boolean> {
  const deadline = Date.now() + DNS_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      if ((await dns.resolve4(domain)).includes(ip)) {
        return true;
      }
    } catch {
      // Not resolvable yet.
    }
    await sleep(10_000);
  }
  return false;
}

async function waitForSsh(state: Deployment): Promise<boolean> {
  const deadline = Date.now() + SSH_WAIT_MS;
  while (Date.now() < deadline) {
    const probe = spawnSync(
      "ssh",
      ["-o", "BatchMode=yes", ...sshArgs(state), "true"],
      { stdio: "ignore" },
    );
    if (probe.status === 0) {
      return true;
    }
    await sleep(5000);
  }
  return false;
}

async function deploy(): Promise<void> {
  console.log(`\n${formatOpenSuiteMcpBanner()}\n`);
  intro("Deploy to AWS");

  await ensureAwsCli();
  const target = await chooseTarget();
  const state: Deployment = loadState(target.name) ?? { ...target };
  state.profile = target.profile;
  state.region = target.region;
  if (state.instanceId) {
    log.info(
      `Resuming ${state.name} from ${statePath(state.name)} (instance ${state.instanceId}).`,
    );
  }

  const identity = await ensureSignedIn(state);
  state.accountId = identity.Account;
  log.success(
    `Signed in to AWS account ${identity.Account} as ${identity.Arn}.`,
  );
  await askInstall(state);

  const domainLabel = state.domain || "<ip>.sslip.io";
  note(
    [
      `Account     ${state.accountId} · ${state.region} · profile ${state.profile}`,
      `Server      ${state.instanceType}, Ubuntu 24.04, 30 GB`,
      `Install     ${state.mode}${state.rootEmail ? `, owner ${state.rootEmail}` : ""}`,
      `Address     https://${domainLabel}`,
      `Version     ${state.version ?? "latest release"}`,
      `Tagged      Project=${state.name}`,
    ].join("\n"),
    "About to create",
  );
  if (
    !(
      unattended ||
      unwrap(await confirm({ message: "Create the server and install?" }))
    )
  ) {
    exitCancel();
  }
  saveState(state);

  const step = spinner();
  try {
    step.start("Importing the SSH key");
    ensureKey(state);
    saveState(state);
    step.message("Creating the security group");
    await ensureSecurityGroup(state);
    step.message(`Launching ${state.instanceType}`);
    ensureInstance(state);
    step.message("Attaching a fixed IP address");
    ensureAddress(state);
    step.stop(`Server ${state.instanceId} is running at ${state.publicIp}.`);
  } catch (error) {
    step.stop("AWS refused a step.");
    fail(
      `${error instanceof Error ? error.message : String(error)}\nRun pnpm bootstrap:aws --name ${state.name} again to continue, or pnpm teardown:aws --name ${state.name} to remove what was created.`,
    );
  }

  const ip = state.publicIp ?? "";
  const domain = state.domain || `${ip.replace(/\./g, "-")}.sslip.io`;
  if (state.domain) {
    note(
      `Add a DNS A record:\n\n  ${state.domain}  →  ${ip}`,
      "Point your domain at the server",
    );
    const dnsWait = spinner();
    dnsWait.start(`Waiting for ${state.domain} to resolve to ${ip}`);
    if (!(await waitForDns(state.domain, ip))) {
      dnsWait.stop("DNS didn't point at the server within 30 minutes.");
      fail(
        `Fix the A record, then run pnpm bootstrap:aws --name ${state.name} again.`,
      );
    }
    dnsWait.stop(`${state.domain} resolves to ${ip}.`);
  }

  const sshWait = spinner();
  sshWait.start("Waiting for SSH");
  if (!(await waitForSsh(state))) {
    sshWait.stop("SSH didn't answer within 5 minutes.");
    fail(
      `Check that port 22 allows your IP address, then run pnpm bootstrap:aws --name ${state.name} again.`,
    );
  }
  sshWait.stop("SSH answers.");

  log.step("Installing OpenSuiteMCP on the server");
  const flags = [
    "--domain",
    domain,
    "--mode",
    state.mode ?? "solo",
    ...(state.rootEmail ? ["--root-email", state.rootEmail] : []),
    ...(state.version ? ["--version", state.version] : []),
  ]
    .map(shellQuote)
    .join(" ");
  const install = spawnSync(
    "ssh",
    [...sshArgs(state), `curl -fsSL ${INSTALL_URL} | sudo bash -s -- ${flags}`],
    { stdio: "inherit" },
  );
  if (install.status !== 0) {
    fail(
      `The installer stopped. Run pnpm bootstrap:aws --name ${state.name} again to retry; it keeps the server.`,
    );
  }
  state.installedAt = new Date().toISOString();
  saveState(state);

  note(
    [
      `Open         https://${domain}${state.mode === "org" ? "/setup" : "/login"}`,
      `SSH          ssh -i ${state.keyPath} ubuntu@${ip}`,
      "Update       sudo osmcp update   (on the server)",
      `Remove all   pnpm teardown:aws --name ${state.name}`,
    ].join("\n"),
    "Done",
  );
  outro(
    state.mode === "org"
      ? `Sign in as ${state.rootEmail} to become the owner.`
      : "Create your account to start.",
  );
}

// ---------------------------------------------------------------- teardown

async function teardown(): Promise<void> {
  intro("Remove an AWS deployment");
  const states = listStates();
  if (states.length === 0) {
    outro(`Nothing to remove: ${STATE_DIR} holds no deployments.`);
    return;
  }

  const name =
    flag("name") ??
    (states.length === 1
      ? states[0].name
      : unwrap(
          await select({
            message: "Which deployment?",
            options: states.map((each) => ({
              value: each.name,
              label: each.name,
              hint: `${each.publicIp ?? "no IP"} · ${each.region}`,
            })),
          }),
        ));
  const state = loadState(name) ?? fail(`No deployment named ${name}.`);
  const target = state as AwsTarget;

  // Deleting needs only EC2 calls, which any AWS CLI v2 makes.
  AWS = findAwsClis().find(supportsLogin) ?? findAwsClis()[0] ?? "aws";
  const identity = await ensureSignedIn(target);
  if (state.accountId && identity.Account !== state.accountId) {
    fail(
      `Profile ${state.profile} is signed in to account ${identity.Account}, but ${state.name} is in ${state.accountId}. Sign in to ${state.accountId} first.`,
    );
  }

  note(
    [
      `Instance        ${state.instanceId ?? "none"}`,
      `IP address      ${state.publicIp ?? "none"} (${state.allocationId ?? "none"})`,
      `Security group  ${state.securityGroupId ?? "none"}`,
      `Key pair        ${state.keyName ?? "none"}`,
    ].join("\n"),
    `${state.name} in ${state.accountId ?? "?"} · ${state.region}`,
  );
  log.warn(
    "This deletes the server, its disk, and every backup on it. It cannot be undone.",
  );
  if (!unattended) {
    const typed = unwrap(
      await text({ message: `Type ${state.name} to delete it` }),
    );
    if (typed !== state.name) {
      exitCancel("Nothing was deleted.");
    }
  }

  const step = spinner();
  const problems: string[] = [];
  const run = (label: string, args: string[]) => {
    step.message(label);
    const result = aws(target, args);
    if (!(result.ok || /NotFound|does not exist/i.test(result.stderr))) {
      problems.push(`${label}: ${result.stderr}`);
    }
  };

  step.start("Removing");
  if (state.instanceId) {
    run("Terminating the server", [
      "ec2",
      "terminate-instances",
      "--instance-ids",
      state.instanceId,
    ]);
    run("Waiting for the server to terminate", [
      "ec2",
      "wait",
      "instance-terminated",
      "--instance-ids",
      state.instanceId,
    ]);
  }
  if (state.allocationId) {
    run("Releasing the IP address", [
      "ec2",
      "release-address",
      "--allocation-id",
      state.allocationId,
    ]);
  }
  if (state.securityGroupId) {
    run("Deleting the security group", [
      "ec2",
      "delete-security-group",
      "--group-id",
      state.securityGroupId,
    ]);
  }
  if (state.keyName) {
    run("Deleting the key pair", [
      "ec2",
      "delete-key-pair",
      "--key-name",
      state.keyName,
    ]);
  }

  if (problems.length > 0) {
    step.stop("Some resources are still there.");
    log.error(problems.join("\n"));
    outro(`Run pnpm teardown:aws --name ${state.name} again.`);
    process.exit(1);
  }
  step.stop("Everything it created is deleted.");
  rmSync(statePath(state.name), { force: true });
  rmSync(knownHostsPath(state.name), { force: true });
  outro(
    `The SSH key stays at ${state.keyPath}; delete it if you won't reuse it.`,
  );
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  if (command === "teardown") {
    await teardown();
  } else if (command === "deploy") {
    await deploy();
  } else {
    fail(
      `Unknown command ${command}. Use pnpm bootstrap:aws or pnpm teardown:aws.`,
    );
  }
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
