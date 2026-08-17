# OpenSuiteMCP on AWS

Cost-optimized CDK app: one `t3.small` EC2 instance running Docker Compose (app, Postgres, Redis, SearXNG, Caddy). HTTPS via Let’s Encrypt. No Fargate, ALB, RDS, or ElastiCache.

Org-specific values stay in **`aws/infra/.env`** (gitignored). Commit `aws/infra/.env.example` only.

## Prerequisites

- An AWS named profile with permission to deploy (set `AWS_PROFILE` in `aws/infra/.env`)
- A Route 53 hosted zone in that account
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running (needed to build/push images)
- Node.js 22+ and pnpm 9.12.3
- CDK bootstrap once per account/region: `pnpm cdk bootstrap`

## Configure

```bash
cp aws/infra/.env.example aws/infra/.env
```

Fill in:

| Variable | Purpose | Example |
| --- | --- | --- |
| `AWS_PROFILE` | Named profile in `~/.aws` (credentials never go in the repo) | `your-profile` |
| `AWS_REGION` | Region to deploy (should match the profile) | `us-east-1` |
| `DOMAIN_NAME` | Public hostname (Route 53 A record, Caddy, `AUTH_URL`) | `opensuitemcp.example.com` |
| `HOSTED_ZONE_NAME` | Existing hosted zone DNS name | `example.com` |
| `HOSTED_ZONE_ID` | Existing hosted zone ID | `ZXXXXXXXXXXXXXX` |

Optional hardening (safe defaults in parentheses):

| Variable | Purpose | Default |
| --- | --- | --- |
| `ORIGIN_INGRESS_MODE` | `public`, `cloudflare`, or `cidrs` | `public` |
| `ALLOWED_HTTPS_CIDRS` | Comma-separated CIDRs when mode is `cidrs` | unset |
| `HTTP_BASIC_AUTH_DEFAULT_ENABLED` | Initial Caddy basic-auth toggle for **new** stacks | `true` |
| `BACKUP_DAILY_RETENTION_DAYS` | Daily AWS Backup retention | `14` |
| `BACKUP_WEEKLY_RETENTION_WEEKS` | Weekly AWS Backup retention | `8` |
| `CDK_BOOTSTRAP_QUALIFIER` | CDK bootstrap qualifier the GitHub infra role assumes | `hnb659fds` |

Keep these **out of git** as well:

| Setting | Where it lives |
| --- | --- |
| AWS access keys / SSO | `~/.aws`, never the repo |
| AWS account ID | Inferred from `AWS_PROFILE`; `aws/infra/cdk.context.json` is gitignored |
| `AUTH_SECRET`, `ENCRYPTION_KEY`, DB/Redis passwords, HTTP basic auth | Generated in Secrets Manager |
| LLM API keys | App UI, encrypted in Postgres |
| NetSuite OAuth / DCR client material | App UI |

## Deploy

From the repo root:

```bash
pnpm cdk deploy
```

First boot: image push, instance setup, Let’s Encrypt. The hosted zone must already be delegated (NS records at your DNS host).

### HTTP basic auth

New AWS deployments enable Caddy HTTP basic auth by default (`HTTP_BASIC_AUTH_DEFAULT_ENABLED=true`). Credentials live in one Secrets Manager secret as JSON `{username,password}` (username starts as `opensuitemcp`; password is generated). After deploy:

```bash
aws secretsmanager get-secret-value \
  --secret-id "$(aws cloudformation describe-stacks --stack-name OpenSuiteMcpStack \
    --query "Stacks[0].Outputs[?OutputKey=='BasicAuthSecretArn'].OutputValue" --output text)" \
  --query SecretString --output text
```

Turn the gate on or off **without a redeploy** via SSM (`/opensuitemcp/http-basic-auth-enabled`). The instance applies the change within about a minute (Caddy reload only). Username/password changes in that same secret are picked up the same way. CDK deploys do **not** overwrite an existing parameter value (`PutParameter` without overwrite).

```bash
# Enable HTTP basic auth
aws ssm put-parameter --name /opensuitemcp/http-basic-auth-enabled \
  --type String --value true --overwrite

# Disable it again
aws ssm put-parameter --name /opensuitemcp/http-basic-auth-enabled \
  --type String --value false --overwrite
```

App login (NextAuth) is unchanged. The NetSuite OAuth callback path already bypasses basic auth so redirects from NetSuite keep working when the gate is on.

Missing or any value other than `true` / `1` / `on` / `yes` means disabled.

SSH is not opened. Use [SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html) if you need a shell.

## Security model

Architecture stays a single public EC2 host with Docker Compose. The controls below are the AWS-side perimeter.

### GitHub OIDC (no long-lived AWS keys)

CI assumes `OpenSuiteMcpGithubAppDeploy` / `OpenSuiteMcpGithubInfraDeploy` via GitHub OIDC. Trust is limited to `sts.amazonaws.com` and subjects `repo:<owner/repo>:ref:refs/heads/main` and `repo:<owner/repo>:environment:production`.

The infra role does **not** have `AdministratorAccess`. It may:

- `sts:AssumeRole` / `sts:TagSession` on the CDK bootstrap roles for this account/region (`deploy`, `file-publishing`, `image-publishing`, `lookup`)
- `ssm:GetParameter` on `/cdk-bootstrap/<qualifier>/version`

It cannot assume the bootstrap `cfn-exec` role and does not get `iam:PassRole` on `*`. CloudFormation still uses the bootstrap execution role created by `cdk bootstrap`.

Trust allows both classic OIDC subjects (`repo:owner/name:...`) and GitHub’s ID-stable subjects (`repo:owner@id/name@id:...`). The trust policy also allows `sts:TagSession` (required by `aws-actions/configure-aws-credentials@v4`).

Custom bootstrap qualifier: set `CDK_BOOTSTRAP_QUALIFIER` (and the matching GitHub Actions variable).

### Origin ingress

Port **22 is closed**. Port **80** stays `0.0.0.0/0` for Caddy/Let’s Encrypt HTTP-01. Port **443** is configurable:

| `ORIGIN_INGRESS_MODE` | HTTPS sources |
| --- | --- |
| `public` | `0.0.0.0/0` (current default; keeps existing deployments reachable) |
| `cloudflare` | Cloudflare published IPv4/IPv6 CIDRs in `aws/infra/lib/cloudflare-ips.ts` |
| `cidrs` | `ALLOWED_HTTPS_CIDRS` (comma-separated) |

Recommended production setup behind Cloudflare:

1. Set `ORIGIN_INGRESS_MODE=cloudflare` in `aws/infra/.env` and the GitHub Actions variable of the same name.
2. Proxy the hostname to the Elastic IP (orange cloud).
3. Use **Full (strict)** SSL with a valid origin certificate.

If Cloudflare proxies DNS, Let’s Encrypt HTTP-01 may not reach the origin even with port 80 open. In that case install a [Cloudflare Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/) certificate (or another origin cert) on Caddy, or stay on `public` until DNS-01 is implemented. Update `cloudflare-ips.ts` when Cloudflare publishes new ranges, then redeploy infra.

### Instance IAM

The instance role has `AmazonSSMManagedInstanceCore` (Session Manager), `grantPull` on the OpenSuiteMCP and CDK asset ECR repositories, and `grantRead` on this stack’s Secrets Manager secrets and the basic-auth SSM parameter only. IMDSv2 is required. Account-wide `AmazonEC2ContainerRegistryReadOnly` is not attached.

### Egress

`allowAllOutbound: true` is retained on purpose. The host needs outbound HTTPS (and DNS) for NetSuite, LLM APIs, GitHub/Oracle skill sync, ECR and other AWS APIs, SearXNG search, Let’s Encrypt, and package updates. Narrowing that without a NAT gateway or brittle SaaS IP lists would break the app. Do not add NAT/ALB/proxies just to filter egress.

### Backups

The 20 GB gp3 data volume is encrypted and uses `RemovalPolicy.RETAIN`. AWS Backup also snapshots that volume only (not the root disk):

- Daily at 07:00 UTC, retain 14 days (`BACKUP_DAILY_RETENTION_DAYS`)
- Weekly Sunday 08:00 UTC, retain 8 weeks (`BACKUP_WEEKLY_RETENTION_WEEKS`)

Vault name: `opensuitemcp-data` (encrypted with the AWS Backup managed key; EBS snapshots inherit the volume’s encryption). These are **crash-consistent** volume snapshots. PostgreSQL usually recovers from them; they are not `pg_dump` / database-aware backups.

### Restore the persistent volume

1. In AWS Backup, open vault `opensuitemcp-data`, pick a recovery point, and restore an EBS volume in the **same AZ** as the instance.
2. SSM to the instance and stop the stack:

   ```bash
   docker-compose --env-file /opt/opensuitemcp/.env -f /opt/opensuitemcp/compose.yml down
   umount /data
   ```

3. Detach the current `/dev/xvdf` volume. Do not delete it until the restore is confirmed.
4. Attach the restored volume as `/dev/xvdf`.
5. Mount and start:

   ```bash
   mount /data
   docker-compose --env-file /opt/opensuitemcp/.env -f /opt/opensuitemcp/compose.yml up -d
   ```

6. The CDK stack still references the previous volume ID (`RemovalPolicy.RETAIN`). After a successful restore, keep the old volume until you are sure, then either accept CloudFormation drift or import the restored volume into the stack.

`cdk destroy` **retains** the data volume and the backup vault. Delete those in the console if you want them gone.

## Other commands

```bash
pnpm cdk diff
pnpm cdk synth
pnpm cdk destroy
pnpm test:infra
```

## What gets created

- VPC, 1 public subnet, no NAT
- `t3.small` Amazon Linux 2023 (2 vCPU, 2 GB) + 2 GB swap
- Elastic IP + Route 53 A record
- 20 GB gp3 data volume (Postgres, Redis, Caddy certs) — survives instance replace
- AWS Backup vault/plan for that data volume
- ECR images for the app and SearXNG (CDK assets plus named `opensuitemcp-app` / `opensuitemcp-searxng` repos for GitHub Actions; scan-on-push)
- Secrets Manager values for auth, encryption, Postgres, Redis, and HTTP basic auth credentials
- SSM `/opensuitemcp/http-basic-auth-enabled` (`true`/`false`) to toggle the Caddy basic-auth gate without redeploying
- Caddy on :80/:443 (Let’s Encrypt + optional HTTP basic auth)
- Optional GitHub OIDC deploy roles when `GITHUB_DEPLOY_REPO` is set

On boot the instance pulls images and runs `docker/compose.prod.yml`. The app container migrates the DB and syncs Oracle skills, then `next start`.

A CDK deploy that changes instance user data (compose, Caddyfile, or CDK-built image URIs) replaces the instance; the data volume is reattached. GitHub Actions app/SearXNG deploys update the running containers in place.

## GitHub Actions

Path-filtered **Deploy** on `main` runs only the parts that changed, in order: infra → app → SearXNG. They share one production lock so a single push never cancels a sibling deploy. Infra deploys run CDK security assertions first.

| Workflow | When | What it does |
| --- | --- | --- |
| `deploy-aws.yml` | Push to `main` when app, infra, or SearXNG paths change; or **Run workflow** | Detects targets, then calls the jobs below in order |
| `deploy-aws-infra.yml` | Called by Deploy, or **Run workflow** | Security tests, then `cdk deploy` (may replace the instance) |
| `deploy-aws-app.yml` | Called by Deploy, or **Run workflow** | Build/push `opensuitemcp-app` and SSM-restart the `app` container |
| `deploy-aws-searxng.yml` | Called by Deploy, or **Run workflow** | Build/push `opensuitemcp-searxng` and SSM-restart `searxng` |
| `aws-infra.yml` | Push | CDK security assertions |

Skipped targets stay skipped (for example an app-only commit does not run CDK). If infra fails, app and SearXNG do not run. Docs, tests, and lint-only changes do not deploy. App/SearXNG deploys do not replace the EC2 instance. Manual **Run workflow** on a leaf still deploys that one target; it waits if Deploy is already using the production lock.

### One-time setup

1. Set `GITHUB_DEPLOY_REPO=owner/repo` in `aws/infra/.env` (this GitHub repo). If the account already has a GitHub OIDC provider (`aws iam list-open-id-connect-providers`), also set `GITHUB_OIDC_PROVIDER_ARN` to that ARN so CDK does not try to create a second one.
2. Deploy locally so CDK can create the OIDC provider, IAM roles, and ECR repos:

   ```bash
   pnpm cdk deploy
   ```

3. In the GitHub repo (Settings → Secrets and variables → Actions), set **repository variables** (not committed):

   | Variable | Value |
   | --- | --- |
   | `AWS_ACCOUNT_ID` | 12-digit account id |
   | `AWS_REGION` | Same as `AWS_REGION` in `aws/infra/.env` |
   | `DOMAIN_NAME` | Same as `DOMAIN_NAME` in `aws/infra/.env` |
   | `HOSTED_ZONE_NAME` | Same as `HOSTED_ZONE_NAME` in `aws/infra/.env` |
   | `HOSTED_ZONE_ID` | Same as `HOSTED_ZONE_ID` in `aws/infra/.env` |

   Optional: `OIDC_PROVIDER_ARN` (maps to CDK’s `GITHUB_OIDC_PROVIDER_ARN`; GitHub forbids variable names starting with `GITHUB_`), `ORIGIN_INGRESS_MODE`, `ALLOWED_HTTPS_CIDRS`, `HTTP_BASIC_AUTH_DEFAULT_ENABLED`, `BACKUP_DAILY_RETENTION_DAYS`, `BACKUP_WEEKLY_RETENTION_WEEKS`, `CDK_BOOTSTRAP_QUALIFIER`.

4. Create a GitHub Environment named `production` (the workflows use it). You can add required reviewers there later.

CI authenticates with GitHub OIDC. Do not put `AWS_PROFILE` or long-lived access keys in GitHub.

## Cost (us-east-1, 24/7, low traffic)

About **$22–28/month**:

| Piece | ~$/month |
| --- | --- |
| EC2 `t3.small` | ~$15 |
| EBS (root 20 GB + data 20 GB gp3) | ~$5 |
| Elastic IP (in use) | ~$4 |
| Secrets Manager (5 secrets) | ~$2 |
| ECR + Route 53 | ~$1 |
| AWS Backup (incremental EBS snapshots) | ~$1–3 |

This replaces the previous Fargate + ALB + RDS + ElastiCache design (~$130–140/month). Tradeoff: single AZ, a few minutes of downtime on deploy, 2 GB RAM (swap if needed).
