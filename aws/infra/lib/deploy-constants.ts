export const APP_ECR_REPO_NAME = "opensuitemcp-app";
export const SEARXNG_ECR_REPO_NAME = "opensuitemcp-searxng";
export const GITHUB_APP_DEPLOY_ROLE_NAME = "OpenSuiteMcpGithubAppDeploy";
export const GITHUB_INFRA_DEPLOY_ROLE_NAME = "OpenSuiteMcpGithubInfraDeploy";
export const INSTANCE_ID_PARAMETER_NAME = "/opensuitemcp/instance-id";
export const BASIC_AUTH_ENABLED_PARAMETER_NAME =
  "/opensuitemcp/http-basic-auth-enabled";
export const INSTANCE_PROJECT_TAG = "opensuitemcp";
export const CDK_BOOTSTRAP_QUALIFIER_DEFAULT = "hnb659fds";
export const DATA_BACKUP_VAULT_NAME = "opensuitemcp-data";
export const DATA_BACKUP_PLAN_NAME = "opensuitemcp-data";
export const DEFAULT_BACKUP_DAILY_RETENTION_DAYS = 14;
export const DEFAULT_BACKUP_WEEKLY_RETENTION_WEEKS = 8;
export const CDK_BOOTSTRAP_ROLE_KINDS = [
  "deploy-role",
  "file-publishing-role",
  "image-publishing-role",
  "lookup-role",
] as const;
