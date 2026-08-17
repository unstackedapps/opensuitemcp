import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import {
  CDK_BOOTSTRAP_QUALIFIER_DEFAULT,
  GITHUB_INFRA_DEPLOY_ROLE_NAME,
} from "../lib/deploy-constants";
import { envFlag, envPositiveInt } from "../lib/env";
import { cdkBootstrapRoleArns } from "../lib/github-deploy";
import { OpenSuiteMcpStack } from "../lib/opensuitemcp-stack";
import { originIngressMode } from "../lib/origin-ingress";

const ENV_KEYS = [
  "DOMAIN_NAME",
  "HOSTED_ZONE_NAME",
  "HOSTED_ZONE_ID",
  "GITHUB_DEPLOY_REPO",
  "GITHUB_OIDC_PROVIDER_ARN",
  "ORIGIN_INGRESS_MODE",
  "ALLOWED_HTTPS_CIDRS",
  "HTTP_BASIC_AUTH_DEFAULT_ENABLED",
  "BACKUP_DAILY_RETENTION_DAYS",
  "BACKUP_WEEKLY_RETENTION_WEEKS",
  "CDK_BOOTSTRAP_QUALIFIER",
] as const;

const previousEnv = new Map<string, string | undefined>();

afterEach(() => {
  restoreEnv();
});

test("GitHub infra role does not use AdministratorAccess", () => {
  const template = synthTemplate();
  const role = gitHubInfraRole(template);
  const managed = JSON.stringify(role.Properties.ManagedPolicyArns ?? []);
  assert.equal(managed.includes("AdministratorAccess"), false);
  assert.equal(managed.includes("PowerUserAccess"), false);
  assert.equal(managed.includes("IAMFullAccess"), false);
});

test("no stack role attaches AdministratorAccess", () => {
  const template = synthTemplate();
  const roles = template.findResources("AWS::IAM::Role");
  for (const [id, resource] of Object.entries(roles)) {
    const managed = JSON.stringify(resource.Properties.ManagedPolicyArns ?? []);
    assert.equal(
      managed.includes("AdministratorAccess"),
      false,
      `${id} attaches AdministratorAccess`,
    );
  }
});

test("GitHub OIDC audience is sts.amazonaws.com and subject is constrained", () => {
  const template = synthTemplate();
  const role = gitHubInfraRole(template);
  const assume = JSON.stringify(role.Properties.AssumeRolePolicyDocument);
  assert.equal(assume.includes("sts.amazonaws.com"), true);
  assert.equal(
    assume.includes("token.actions.githubusercontent.com:aud"),
    true,
  );
  assert.equal(
    assume.includes("repo:example/opensuitemcp:ref:refs/heads/main"),
    true,
  );
  assert.equal(
    assume.includes("repo:example/opensuitemcp:environment:production"),
    true,
  );
  assert.equal(
    assume.includes("repo:example@*/opensuitemcp@*:environment:production"),
    true,
  );
});

test("GitHub app deploy role SendCommand uses the AWS-managed document ARN", () => {
  const template = synthTemplate();
  const policies = JSON.stringify(iamPolicyDocuments(template));
  assert.equal(
    policies.includes("arn:aws:ssm:us-east-1::document/AWS-RunShellScript"),
    true,
  );
  assert.equal(
    policies.includes(
      "arn:aws:ssm:us-east-1:123456789012:document/AWS-RunShellScript",
    ),
    false,
  );
});

test("GitHub infra role can assume CDK bootstrap roles only", () => {
  const template = synthTemplate();
  const expected = cdkBootstrapRoleArns(
    "123456789012",
    "us-east-1",
    CDK_BOOTSTRAP_QUALIFIER_DEFAULT,
  );
  const policies = iamPolicyDocuments(template);
  const joined = JSON.stringify(policies);
  for (const arn of expected) {
    assert.equal(joined.includes(arn), true, `missing ${arn}`);
  }
  assert.equal(joined.includes("cfn-exec-role"), false);
  assert.equal(hasPassRoleStar(policies), false);
});

test("EC2 requires IMDSv2", () => {
  const template = synthTemplate();
  const launchTemplates = template.findResources("AWS::EC2::LaunchTemplate");
  const instances = template.findResources("AWS::EC2::Instance");
  const tokens = [
    ...httpTokens(launchTemplates, "LaunchTemplateData"),
    ...httpTokens(instances, "MetadataOptions"),
  ];
  assert.equal(tokens.includes("required"), true);
  assert.equal(tokens.includes("optional"), false);
});

test("root and persistent EBS are encrypted; persistent volume is retained", () => {
  const template = synthTemplate();
  const volumes = template.findResources("AWS::EC2::Volume");
  assert.equal(Object.keys(volumes).length > 0, true);
  for (const volume of Object.values(volumes)) {
    assert.equal(volume.Properties.Encrypted, true);
    assert.equal(volume.DeletionPolicy, "Retain");
  }

  const instanceStorage = JSON.stringify([
    template.findResources("AWS::EC2::LaunchTemplate"),
    template.findResources("AWS::EC2::Instance"),
  ]);
  assert.equal(instanceStorage.includes('"Encrypted":true'), true);
});

test("SSH is not opened", () => {
  const template = synthTemplate();
  for (const rule of securityGroupIngress(template)) {
    const protocol = String(rule.IpProtocol ?? "");
    const fromPort = Number(rule.FromPort ?? Number.NaN);
    const toPort = Number(rule.ToPort ?? Number.NaN);
    const coversSsh =
      protocol === "-1" ||
      (protocol === "tcp" && fromPort <= 22 && toPort >= 22);
    assert.equal(coversSsh, false, `SSH ingress: ${JSON.stringify(rule)}`);
  }
});

test("ECR repositories scan on push", () => {
  const template = synthTemplate();
  template.hasResourceProperties("AWS::ECR::Repository", {
    ImageScanningConfiguration: { ScanOnPush: true },
  });
  const repos = template.findResources("AWS::ECR::Repository");
  for (const repo of Object.values(repos)) {
    assert.equal(repo.Properties.ImageScanningConfiguration?.ScanOnPush, true);
  }
});

test("backup plan targets the persistent EBS volume", () => {
  const template = synthTemplate();
  template.resourceCountIs("AWS::Backup::BackupVault", 1);
  template.resourceCountIs("AWS::Backup::BackupPlan", 1);
  template.resourceCountIs("AWS::Backup::BackupSelection", 1);
  const selection = Object.values(
    template.findResources("AWS::Backup::BackupSelection"),
  ).at(0);
  const resources = JSON.stringify(
    selection?.Properties.BackupSelection?.Resources ?? [],
  );
  assert.equal(resources.includes("volume"), true);
});

test("public HTTPS ingress may use 0.0.0.0/0; SSH still closed", () => {
  const template = synthTemplate({ ORIGIN_INGRESS_MODE: "public" });
  const https = securityGroupIngress(template).filter(
    (rule) => Number(rule.FromPort) === 443,
  );
  assert.equal(
    https.some((rule) => rule.CidrIp === "0.0.0.0/0"),
    true,
  );
});

test("Cloudflare mode does not allow HTTPS from 0.0.0.0/0", () => {
  const template = synthTemplate({ ORIGIN_INGRESS_MODE: "cloudflare" });
  const https = securityGroupIngress(template).filter(
    (rule) => Number(rule.FromPort) === 443,
  );
  assert.equal(https.length > 0, true);
  for (const rule of https) {
    assert.notEqual(rule.CidrIp, "0.0.0.0/0");
    assert.notEqual(rule.CidrIpv6, "::/0");
  }
});

test("cidrs mode uses ALLOWED_HTTPS_CIDRS", () => {
  const template = synthTemplate({
    ORIGIN_INGRESS_MODE: "cidrs",
    ALLOWED_HTTPS_CIDRS: "203.0.113.0/24",
  });
  const https = securityGroupIngress(template).filter(
    (rule) => Number(rule.FromPort) === 443,
  );
  assert.equal(
    https.some((rule) => rule.CidrIp === "203.0.113.0/24"),
    true,
  );
  assert.equal(
    https.some((rule) => rule.CidrIp === "0.0.0.0/0"),
    false,
  );
});

test("originIngressMode defaults to public and rejects unknown values", () => {
  assert.equal(originIngressMode(undefined), "public");
  assert.equal(originIngressMode(" "), "public");
  assert.equal(originIngressMode("cloudflare"), "cloudflare");
  assert.throws(() => originIngressMode("open"), /ORIGIN_INGRESS_MODE/);
});

test("HTTP basic auth default is enabled unless explicitly disabled", () => {
  assert.equal(envFlag("HTTP_BASIC_AUTH_DEFAULT_ENABLED", true), true);
  withEnv({ HTTP_BASIC_AUTH_DEFAULT_ENABLED: "false" }, () => {
    assert.equal(envFlag("HTTP_BASIC_AUTH_DEFAULT_ENABLED", true), false);
  });
});

test("backup retention parses positive integers", () => {
  assert.equal(envPositiveInt("BACKUP_DAILY_RETENTION_DAYS", 14), 14);
  withEnv({ BACKUP_DAILY_RETENTION_DAYS: "21" }, () => {
    assert.equal(envPositiveInt("BACKUP_DAILY_RETENTION_DAYS", 14), 21);
  });
  withEnv({ BACKUP_DAILY_RETENTION_DAYS: "0" }, () => {
    assert.throws(
      () => envPositiveInt("BACKUP_DAILY_RETENTION_DAYS", 14),
      /positive integer/,
    );
  });
});

test("instance role keeps SSM core and does not use account-wide ECR read", () => {
  const template = synthTemplate();
  const instanceRole = Object.values(
    template.findResources("AWS::IAM::Role"),
  ).find((role) => {
    const managed = JSON.stringify(role.Properties.ManagedPolicyArns ?? []);
    return managed.includes("AmazonSSMManagedInstanceCore");
  });
  assert.equal(instanceRole !== undefined, true);
  const managed = JSON.stringify(
    instanceRole?.Properties.ManagedPolicyArns ?? [],
  );
  assert.equal(managed.includes("AmazonEC2ContainerRegistryReadOnly"), false);
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: Match.arrayWith(["secretsmanager:GetSecretValue"]),
        }),
      ]),
    },
  });
});

const templateCache = new Map<string, Template>();

function synthTemplate(
  overrides: Record<string, string | undefined> = {},
): Template {
  const cacheKey = JSON.stringify(overrides);
  const cached = templateCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const template = withEnv(
    {
      DOMAIN_NAME: "opensuitemcp.example.test",
      HOSTED_ZONE_NAME: "example.test",
      HOSTED_ZONE_ID: "ZTESTHOSTEDZONEID",
      GITHUB_DEPLOY_REPO: "example/opensuitemcp",
      ORIGIN_INGRESS_MODE: "public",
      HTTP_BASIC_AUTH_DEFAULT_ENABLED: "true",
      BACKUP_DAILY_RETENTION_DAYS: "14",
      BACKUP_WEEKLY_RETENTION_WEEKS: "8",
      GITHUB_OIDC_PROVIDER_ARN: undefined,
      ALLOWED_HTTPS_CIDRS: undefined,
      CDK_BOOTSTRAP_QUALIFIER: undefined,
      ...overrides,
    },
    () => {
      const app = new App({
        context: {
          "aws:cdk:bundling-stacks": [],
        },
      });
      const stack = new OpenSuiteMcpStack(app, "OpenSuiteMcpStack", {
        env: { account: "123456789012", region: "us-east-1" },
      });
      return Template.fromStack(stack);
    },
  );
  templateCache.set(cacheKey, template);
  return template;
}

function gitHubInfraRole(template: Template) {
  const role = Object.values(template.findResources("AWS::IAM::Role")).find(
    (resource) =>
      resource.Properties.RoleName === GITHUB_INFRA_DEPLOY_ROLE_NAME,
  );
  assert.equal(role !== undefined, true, "GitHubInfraDeployRole missing");
  return role as { Properties: Record<string, unknown> };
}

function iamPolicyDocuments(template: Template): unknown[] {
  const documents: unknown[] = [];
  for (const role of Object.values(template.findResources("AWS::IAM::Role"))) {
    documents.push(role.Properties.AssumeRolePolicyDocument);
    documents.push(role.Properties.Policies);
  }
  for (const policy of Object.values(
    template.findResources("AWS::IAM::Policy"),
  )) {
    documents.push(policy.Properties.PolicyDocument);
  }
  return documents;
}

function hasPassRoleStar(documents: unknown[]): boolean {
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== "object") {
      return false;
    }
    if (Array.isArray(node)) {
      return node.some((item) => visit(item));
    }
    const record = node as Record<string, unknown>;
    const actions = flattenActions(record.Action);
    if (
      actions.includes("iam:PassRole") &&
      (record.Resource === "*" ||
        (Array.isArray(record.Resource) && record.Resource.includes("*")))
    ) {
      return true;
    }
    return Object.values(record).some((value) => visit(value));
  };
  return documents.some((document) => visit(document));
}

function flattenActions(action: unknown): string[] {
  if (typeof action === "string") {
    return [action];
  }
  if (Array.isArray(action)) {
    return action.filter((item) => typeof item === "string");
  }
  return [];
}

function httpTokens(
  resources: Record<string, { Properties?: Record<string, unknown> }>,
  path: string,
): string[] {
  const tokens: string[] = [];
  for (const resource of Object.values(resources)) {
    const props = resource.Properties ?? {};
    if (path === "LaunchTemplateData") {
      const data = props.LaunchTemplateData as
        | { MetadataOptions?: { HttpTokens?: string } }
        | undefined;
      if (data?.MetadataOptions?.HttpTokens) {
        tokens.push(data.MetadataOptions.HttpTokens);
      }
    }
    if (path === "MetadataOptions") {
      const meta = props.MetadataOptions as { HttpTokens?: string } | undefined;
      if (meta?.HttpTokens) {
        tokens.push(meta.HttpTokens);
      }
    }
  }
  return tokens;
}

function securityGroupIngress(
  template: Template,
): Array<Record<string, unknown>> {
  const rules: Array<Record<string, unknown>> = [];
  for (const sg of Object.values(
    template.findResources("AWS::EC2::SecurityGroup"),
  )) {
    for (const rule of sg.Properties.SecurityGroupIngress ?? []) {
      rules.push(rule as Record<string, unknown>);
    }
  }
  for (const ingress of Object.values(
    template.findResources("AWS::EC2::SecurityGroupIngress"),
  )) {
    rules.push(ingress.Properties as Record<string, unknown>);
  }
  return rules;
}

function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T,
): T {
  saveEnv();
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    restoreEnv();
  }
}

function saveEnv(): void {
  if (previousEnv.size > 0) {
    return;
  }
  for (const key of ENV_KEYS) {
    previousEnv.set(key, process.env[key]);
  }
}

function restoreEnv(): void {
  for (const [key, value] of previousEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  previousEnv.clear();
}
