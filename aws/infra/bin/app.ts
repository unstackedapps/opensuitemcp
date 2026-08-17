#!/usr/bin/env node
import "../load-env.cjs";
import { App } from "aws-cdk-lib";
import { OpenSuiteMcpStack } from "../lib/opensuitemcp-stack";

const app = new App();

new OpenSuiteMcpStack(app, "OpenSuiteMcpStack", {
  description: "OpenSuiteMCP — Next.js, Postgres, Redis, and SearXNG",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    Project: "opensuitemcp",
  },
});
