import { Annotations, CfnOutput, type Stack } from "aws-cdk-lib";
import type { IRepository } from "aws-cdk-lib/aws-ecr";
import {
  type CfnRole,
  Effect,
  FederatedPrincipal,
  type IOpenIdConnectProvider,
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import type { IStringParameter } from "aws-cdk-lib/aws-ssm";
import {
  CDK_BOOTSTRAP_QUALIFIER_DEFAULT,
  CDK_BOOTSTRAP_ROLE_KINDS,
  GITHUB_APP_DEPLOY_ROLE_NAME,
  GITHUB_INFRA_DEPLOY_ROLE_NAME,
  INSTANCE_PROJECT_TAG,
} from "./deploy-constants";
import { envString } from "./env";

export type GitHubDeployRepos = {
  appRepo: IRepository;
  searxngRepo: IRepository;
  instanceIdParam: IStringParameter;
};

export function cdkBootstrapQualifier(): string {
  return envString("CDK_BOOTSTRAP_QUALIFIER", CDK_BOOTSTRAP_QUALIFIER_DEFAULT);
}

export function cdkBootstrapRoleArns(
  account: string,
  region: string,
  qualifier = cdkBootstrapQualifier(),
): string[] {
  return CDK_BOOTSTRAP_ROLE_KINDS.map(
    (kind) =>
      `arn:aws:iam::${account}:role/cdk-${qualifier}-${kind}-${account}-${region}`,
  );
}

export function addGitHubDeployAccess(
  stack: Stack,
  repos: GitHubDeployRepos,
): void {
  const repo = process.env.GITHUB_DEPLOY_REPO?.trim();
  if (!repo) {
    Annotations.of(stack).addInfo(
      "GITHUB_DEPLOY_REPO is unset; skipping GitHub Actions OIDC roles.",
    );
    return;
  }

  const provider = githubOidcProvider(stack);

  const appRole = new Role(stack, "GitHubAppDeployRole", {
    roleName: GITHUB_APP_DEPLOY_ROLE_NAME,
    description: "GitHub Actions: push app/SearXNG images and SSM restart",
    assumedBy: githubPrincipal(provider, repo),
  });
  allowGithubOidcTagSession(appRole);
  repos.appRepo.grantPullPush(appRole);
  repos.searxngRepo.grantPullPush(appRole);
  repos.instanceIdParam.grantRead(appRole);
  appRole.addToPolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ecr:GetAuthorizationToken"],
      resources: ["*"],
    }),
  );
  // AWS-managed documents use an empty account id in the ARN.
  const ssmDocumentArn = `arn:aws:ssm:${stack.region}::document/AWS-RunShellScript`;
  const instanceArn = `arn:aws:ec2:${stack.region}:${stack.account}:instance/*`;
  appRole.addToPolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ssm:SendCommand"],
      resources: [ssmDocumentArn],
    }),
  );
  appRole.addToPolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ssm:SendCommand"],
      resources: [instanceArn],
      conditions: {
        StringEquals: {
          "ssm:resourceTag/Project": INSTANCE_PROJECT_TAG,
        },
      },
    }),
  );
  appRole.addToPolicy(
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ssm:GetCommandInvocation"],
      resources: ["*"],
    }),
  );

  const infraRole = new Role(stack, "GitHubInfraDeployRole", {
    roleName: GITHUB_INFRA_DEPLOY_ROLE_NAME,
    description:
      "GitHub Actions: assume CDK bootstrap roles to deploy OpenSuiteMCP",
    assumedBy: githubPrincipal(provider, repo),
  });
  allowGithubOidcTagSession(infraRole);
  const qualifier = cdkBootstrapQualifier();
  infraRole.addToPolicy(
    new PolicyStatement({
      sid: "AssumeCdkBootstrapRoles",
      effect: Effect.ALLOW,
      actions: ["sts:AssumeRole", "sts:TagSession"],
      resources: cdkBootstrapRoleArns(stack.account, stack.region, qualifier),
    }),
  );
  infraRole.addToPolicy(
    new PolicyStatement({
      sid: "ReadCdkBootstrapVersion",
      effect: Effect.ALLOW,
      actions: ["ssm:GetParameter"],
      resources: [
        `arn:aws:ssm:${stack.region}:${stack.account}:parameter/cdk-bootstrap/${qualifier}/version`,
      ],
    }),
  );

  new CfnOutput(stack, "GitHubAppDeployRoleArn", {
    value: appRole.roleArn,
    description: "OIDC role for app/SearXNG image deploys",
  });
  new CfnOutput(stack, "GitHubInfraDeployRoleArn", {
    value: infraRole.roleArn,
    description: "OIDC role for CDK infra deploys via bootstrap roles",
  });
}

function allowGithubOidcTagSession(role: Role): void {
  const cfnRole = role.node.defaultChild as CfnRole;
  cfnRole.addPropertyOverride("AssumeRolePolicyDocument.Statement.0.Action", [
    "sts:AssumeRoleWithWebIdentity",
    "sts:TagSession",
  ]);
}

function githubPrincipal(
  provider: IOpenIdConnectProvider,
  repo: string,
): FederatedPrincipal {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(
      `GITHUB_DEPLOY_REPO must be owner/name (got ${JSON.stringify(repo)})`,
    );
  }

  // GitHub may emit classic subjects (owner/name) or ID-stable subjects
  // (owner@id/name@id). Allow both. See CloudTrail userName on AssumeRoleWithWebIdentity.
  // TagSession is required by aws-actions/configure-aws-credentials@v4.
  return new FederatedPrincipal(
    provider.openIdConnectProviderArn,
    {
      StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      },
      StringLike: {
        "token.actions.githubusercontent.com:sub": [
          `repo:${owner}/${name}:ref:refs/heads/main`,
          `repo:${owner}/${name}:environment:production`,
          `repo:${owner}@*/${name}@*:ref:refs/heads/main`,
          `repo:${owner}@*/${name}@*:environment:production`,
        ],
      },
    },
    "sts:AssumeRoleWithWebIdentity",
  );
}

function githubOidcProvider(stack: Stack): IOpenIdConnectProvider {
  const existingArn = process.env.GITHUB_OIDC_PROVIDER_ARN?.trim();
  if (existingArn) {
    return OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      stack,
      "GitHubOidc",
      existingArn,
    );
  }

  return new OpenIdConnectProvider(stack, "GitHubOidc", {
    url: "https://token.actions.githubusercontent.com",
    clientIds: ["sts.amazonaws.com"],
  });
}
