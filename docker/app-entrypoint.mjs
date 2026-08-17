import { spawn } from "node:child_process";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const postgresUser = encodeURIComponent(required("POSTGRES_USER"));
const postgresPassword = encodeURIComponent(required("POSTGRES_PASSWORD"));
const postgresHost = required("POSTGRES_HOST");
const postgresPort = process.env.POSTGRES_PORT || "5432";
const postgresDb = encodeURIComponent(required("POSTGRES_DB"));

const sslmode = process.env.POSTGRES_SSLMODE || "require";
process.env.POSTGRES_URL = `postgresql://${postgresUser}:${postgresPassword}@${postgresHost}:${postgresPort}/${postgresDb}?sslmode=${sslmode}`;

const redisHost = required("REDIS_HOST");
const redisPort = process.env.REDIS_PORT || "6379";
const redisPassword = process.env.REDIS_PASSWORD;
if (redisPassword) {
  process.env.REDIS_URL = `redis://:${encodeURIComponent(redisPassword)}@${redisHost}:${redisPort}`;
} else {
  process.env.REDIS_URL = `redis://${redisHost}:${redisPort}`;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

await run("pnpm", ["db:migrate"]);

try {
  await run("pnpm", ["skills:sync"]);
} catch (error) {
  console.warn("Skills sync failed; continuing startup.", error);
}

await run("pnpm", [
  "exec",
  "next",
  "start",
  "--hostname",
  "0.0.0.0",
  "--port",
  process.env.PORT || "3000",
]);
