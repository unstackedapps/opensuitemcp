"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

function loadInfraEnv() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadInfraEnv();

module.exports = { loadInfraEnv };
