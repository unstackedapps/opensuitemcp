import { Duration, RemovalPolicy, Stack, Tags } from "aws-cdk-lib";
import {
  BackupPlan,
  BackupPlanRule,
  BackupResource,
  BackupVault,
} from "aws-cdk-lib/aws-backup";
import type { Volume } from "aws-cdk-lib/aws-ec2";
import { Schedule } from "aws-cdk-lib/aws-events";
import type { Construct } from "constructs";
import {
  DATA_BACKUP_PLAN_NAME,
  DATA_BACKUP_VAULT_NAME,
  DEFAULT_BACKUP_DAILY_RETENTION_DAYS,
  DEFAULT_BACKUP_WEEKLY_RETENTION_WEEKS,
  INSTANCE_PROJECT_TAG,
} from "./deploy-constants";
import { envPositiveInt } from "./env";

export function addPersistentDataBackup(
  scope: Construct,
  dataVolume: Volume,
): BackupVault {
  const dailyDays = envPositiveInt(
    "BACKUP_DAILY_RETENTION_DAYS",
    DEFAULT_BACKUP_DAILY_RETENTION_DAYS,
  );
  const weeklyWeeks = envPositiveInt(
    "BACKUP_WEEKLY_RETENTION_WEEKS",
    DEFAULT_BACKUP_WEEKLY_RETENTION_WEEKS,
  );

  const vault = new BackupVault(scope, "PersistentDataBackupVault", {
    // Avoid a fixed name: a retained orphan from a failed deploy would block recreate.
    removalPolicy: RemovalPolicy.RETAIN,
  });
  Tags.of(vault).add("Name", DATA_BACKUP_VAULT_NAME);
  Tags.of(vault).add("Project", INSTANCE_PROJECT_TAG);

  const plan = new BackupPlan(scope, "DataBackupPlan", {
    backupPlanName: DATA_BACKUP_PLAN_NAME,
    backupVault: vault,
    backupPlanRules: [
      new BackupPlanRule({
        ruleName: "Daily",
        scheduleExpression: Schedule.cron({ minute: "0", hour: "7" }),
        deleteAfter: Duration.days(dailyDays),
        recoveryPointTags: { Project: INSTANCE_PROJECT_TAG },
      }),
      new BackupPlanRule({
        ruleName: "Weekly",
        scheduleExpression: Schedule.cron({
          minute: "0",
          hour: "8",
          weekDay: "SUN",
        }),
        deleteAfter: Duration.days(weeklyWeeks * 7),
        recoveryPointTags: { Project: INSTANCE_PROJECT_TAG },
      }),
    ],
  });

  plan.addSelection("PersistentDataVolume", {
    backupSelectionName: "opensuitemcp-persistent-data",
    resources: [
      BackupResource.fromArn(
        Stack.of(dataVolume).formatArn({
          service: "ec2",
          resource: "volume",
          resourceName: dataVolume.volumeId,
        }),
      ),
    ],
  });

  return vault;
}
