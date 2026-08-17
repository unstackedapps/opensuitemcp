import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ArnFormat,
  CfnOutput,
  RemovalPolicy,
  Size,
  Stack,
  type StackProps,
  Tags,
} from "aws-cdk-lib";
import {
  BlockDeviceVolume,
  CfnEIP,
  CfnEIPAssociation,
  CfnVolumeAttachment,
  EbsDeviceVolumeType,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  SecurityGroup,
  SubnetType,
  UserData,
  Volume,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import type { Construct } from "constructs";
import { addPersistentDataBackup } from "./data-backup";
import {
  APP_ECR_REPO_NAME,
  BASIC_AUTH_ENABLED_PARAMETER_NAME,
  INSTANCE_ID_PARAMETER_NAME,
  INSTANCE_PROJECT_TAG,
  SEARXNG_ECR_REPO_NAME,
} from "./deploy-constants";
import { envFlag, requiredEnv } from "./env";
import { addGitHubDeployAccess } from "./github-deploy";
import { addOriginIngress } from "./origin-ingress";

const REPO_ROOT = join(__dirname, "../../..");
const INFRA_DIR = join(__dirname, "..");
const DOCKER_ASSET_EXCLUDE = [
  "aws",
  "infra",
  "cdk.out",
  ".git",
  ".github",
  ".cursor",
  ".next",
  "node_modules",
];

export class OpenSuiteMcpStack extends Stack {
  public constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const domainName = requiredEnv("DOMAIN_NAME");
    const hostedZoneName = requiredEnv("HOSTED_ZONE_NAME");
    const hostedZoneId = requiredEnv("HOSTED_ZONE_ID");
    const appOrigin = `https://${domainName}`;
    const region = Stack.of(this).region;

    const vpc = new Vpc(this, "Vpc", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });

    const subnet = vpc.publicSubnets.at(0);
    if (!subnet) {
      throw new Error("VPC has no public subnet");
    }

    const appRepo = new Repository(this, "AppEcr", {
      repositoryName: APP_ECR_REPO_NAME,
      removalPolicy: RemovalPolicy.RETAIN,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20 }],
    });
    const searxngRepo = new Repository(this, "SearxngEcr", {
      repositoryName: SEARXNG_ECR_REPO_NAME,
      removalPolicy: RemovalPolicy.RETAIN,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20 }],
    });

    const appImage = new DockerImageAsset(this, "AppImage", {
      directory: REPO_ROOT,
      file: "docker/Dockerfile",
      platform: Platform.LINUX_AMD64,
      exclude: DOCKER_ASSET_EXCLUDE,
    });

    const searxngImage = new DockerImageAsset(this, "SearxngImage", {
      directory: REPO_ROOT,
      file: "docker/Dockerfile.searxng",
      platform: Platform.LINUX_AMD64,
      exclude: DOCKER_ASSET_EXCLUDE,
    });

    const authSecret = new Secret(this, "AuthSecret", {
      description: "OpenSuiteMCP AUTH_SECRET",
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    const encryptionKey = new Secret(this, "EncryptionKey", {
      description: "OpenSuiteMCP ENCRYPTION_KEY",
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    const postgresSecret = new Secret(this, "PostgresPassword", {
      description: "OpenSuiteMCP Postgres password",
      generateSecretString: {
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    const redisSecret = new Secret(this, "RedisPassword", {
      description: "OpenSuiteMCP Redis password",
      generateSecretString: {
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    const basicAuthSecret = new Secret(this, "BasicAuth", {
      description:
        "OpenSuiteMCP HTTP basic auth (Caddy). Single JSON secret: {username,password}",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "opensuitemcp" }),
        generateStringKey: "password",
        passwordLength: 24,
        excludePunctuation: true,
      },
    });

    const basicAuthDefaultEnabled = envFlag(
      "HTTP_BASIC_AUTH_DEFAULT_ENABLED",
      true,
    );
    // Build the ARN explicitly. fromStringParameterName requires the parameter
    // to already exist at deploy time, which breaks first-time / post-rollback deploys.
    const basicAuthEnabledParamArn = Stack.of(this).formatArn({
      service: "ssm",
      resource: "parameter",
      resourceName: BASIC_AUTH_ENABLED_PARAMETER_NAME.replace(/^\//, ""),
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    });
    const basicAuthEnabledInit = new AwsCustomResource(
      this,
      "BasicAuthEnabledParamInit",
      {
        onCreate: {
          service: "SSM",
          action: "putParameter",
          parameters: {
            Name: BASIC_AUTH_ENABLED_PARAMETER_NAME,
            Value: basicAuthDefaultEnabled ? "true" : "false",
            Type: "String",
            Description:
              "Caddy HTTP basic auth. Set to true to enable without redeploying; the instance applies within about a minute. Credentials are the BasicAuth secret JSON {username,password}.",
          },
          ignoreErrorCodesMatching: "ParameterAlreadyExists",
          physicalResourceId: PhysicalResourceId.of(
            "opensuitemcp-http-basic-auth-enabled",
          ),
        },
        // Do not delete on stack rollback/remove: the toggle is operational state
        // and must survive failed deploys that create-then-roll-back this resource.
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ssm:PutParameter"],
            resources: [basicAuthEnabledParamArn],
          }),
        ]),
        installLatestAwsSdk: false,
      },
    );

    const role = new Role(this, "InstanceRole", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });
    appImage.repository.grantPull(role);
    searxngImage.repository.grantPull(role);
    appRepo.grantPull(role);
    searxngRepo.grantPull(role);
    authSecret.grantRead(role);
    encryptionKey.grantRead(role);
    postgresSecret.grantRead(role);
    redisSecret.grantRead(role);
    basicAuthSecret.grantRead(role);
    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParameterHistory",
          "ssm:DescribeParameters",
        ],
        resources: [basicAuthEnabledParamArn],
      }),
    );

    // Outbound stays open: the app needs NetSuite, LLM APIs, ECR, AWS APIs,
    // SearXNG search, ACME, DNS, and GitHub/Oracle skill sync. Restricting
    // egress would need NAT or fragile SaaS IP allowlists.
    const appSg = new SecurityGroup(this, "AppSg", {
      vpc,
      description: "OpenSuiteMCP EC2 (HTTP/HTTPS)",
      allowAllOutbound: true,
    });
    const ingressMode = addOriginIngress(appSg);

    const eip = new CfnEIP(this, "Eip", { domain: "vpc" });

    const dataVolume = new Volume(this, "DataVolume", {
      availabilityZone: subnet.availabilityZone,
      size: Size.gibibytes(20),
      volumeType: EbsDeviceVolumeType.GP3,
      encrypted: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const dataBackupVault = addPersistentDataBackup(this, dataVolume);

    const composeB64 = readFileSync(
      join(REPO_ROOT, "docker/compose.prod.yml"),
    ).toString("base64");
    const caddyB64 = readFileSync(join(REPO_ROOT, "docker/Caddyfile")).toString(
      "base64",
    );
    const syncBasicAuthB64 = Buffer.from(
      readFileSync(join(INFRA_DIR, "sync-basic-auth.sh"), "utf8").replaceAll(
        "\r\n",
        "\n",
      ),
      "utf8",
    ).toString("base64");
    const userDataTemplate = readFileSync(
      join(INFRA_DIR, "user-data.sh"),
      "utf8",
    ).replaceAll("\r\n", "\n");
    const userDataScript = renderTemplate(userDataTemplate, {
      DOMAIN: domainName,
      EIP: eip.ref,
      AWS_REGION: region,
      APP_IMAGE: appImage.imageUri,
      SEARXNG_IMAGE: searxngImage.imageUri,
      AUTH_SECRET_ARN: authSecret.secretArn,
      ENCRYPTION_KEY_ARN: encryptionKey.secretArn,
      POSTGRES_SECRET_ARN: postgresSecret.secretArn,
      REDIS_SECRET_ARN: redisSecret.secretArn,
      BASIC_AUTH_SECRET_ARN: basicAuthSecret.secretArn,
      BASIC_AUTH_ENABLED_PARAMETER_NAME,
      COMPOSE_B64: composeB64,
      CADDY_B64: caddyB64,
      SYNC_BASIC_AUTH_B64: syncBasicAuthB64,
    });

    const instance = new Instance(this, "App", {
      vpc,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      availabilityZone: subnet.availabilityZone,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.SMALL),
      // Pin AMI so deploys do not replace the instance solely because a newer
      // Amazon Linux 2023 image was published (volume reattach then fails).
      machineImage: MachineImage.genericLinux({
        [Stack.of(this).region]: "ami-07a5b367e8dc8bd92",
      }),
      role,
      securityGroup: appSg,
      userData: UserData.custom(userDataScript),
      // Keep false until a controlled cutover: replacing the instance while the
      // retained data volume is still attached fails CFN volume reattachment.
      userDataCausesReplacement: false,
      requireImdsv2: true,
      associatePublicIpAddress: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: BlockDeviceVolume.ebs(20, {
            volumeType: EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });
    instance.node.addDependency(basicAuthEnabledInit);

    new CfnEIPAssociation(this, "EipAssoc", {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });

    new CfnVolumeAttachment(this, "DataAttach", {
      device: "/dev/xvdf",
      instanceId: instance.instanceId,
      volumeId: dataVolume.volumeId,
    });

    const zone = HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId,
      zoneName: hostedZoneName,
    });

    new ARecord(this, "Dns", {
      zone,
      recordName: domainName,
      target: RecordTarget.fromIpAddresses(eip.ref),
    });

    Tags.of(instance).add("Project", INSTANCE_PROJECT_TAG);

    const instanceIdParam = new StringParameter(this, "InstanceIdParam", {
      parameterName: INSTANCE_ID_PARAMETER_NAME,
      stringValue: instance.instanceId,
      description: "OpenSuiteMCP EC2 instance id for SSM deploys",
    });

    addGitHubDeployAccess(this, {
      appRepo,
      searxngRepo,
      instanceIdParam,
    });

    new CfnOutput(this, "AppUrl", {
      value: appOrigin,
      description: "Public HTTPS URL",
    });

    new CfnOutput(this, "BasicAuthSecretArn", {
      value: basicAuthSecret.secretArn,
      description:
        "Secrets Manager JSON {username,password} for HTTP basic auth",
    });

    new CfnOutput(this, "BasicAuthEnabledParameter", {
      value: BASIC_AUTH_ENABLED_PARAMETER_NAME,
      description:
        "SSM String parameter (true/false) to toggle HTTP basic auth without redeploying",
    });

    new CfnOutput(this, "OriginIngressMode", {
      value: ingressMode,
      description:
        "HTTPS origin ingress: public, cloudflare, or cidrs (port 80 stays open for ACME)",
    });

    new CfnOutput(this, "DataBackupVaultName", {
      value: dataBackupVault.backupVaultName,
      description: "AWS Backup vault for the persistent EBS volume",
    });

    new CfnOutput(this, "ElasticIp", {
      value: eip.ref,
      description: "Elastic IP",
    });

    new CfnOutput(this, "AppEcrUri", {
      value: appRepo.repositoryUri,
      description: "ECR repository for app image deploys",
    });

    new CfnOutput(this, "SearxngEcrUri", {
      value: searxngRepo.repositoryUri,
      description: "ECR repository for SearXNG image deploys",
    });
  }
}

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}
