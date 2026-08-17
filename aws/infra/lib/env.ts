export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy aws/infra/.env.example to aws/infra/.env and set it.`,
    );
  }
  return value;
}

export function envString(name: string, defaultValue: string): string {
  const value = process.env[name]?.trim();
  return value ? value : defaultValue;
}

export function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return defaultValue;
  }
  if (["true", "1", "on", "yes"].includes(raw)) {
    return true;
  }
  if (["false", "0", "off", "no"].includes(raw)) {
    return false;
  }
  throw new Error(`${name} must be true or false (got ${process.env[name]})`);
}

export function envPositiveInt(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `${name} must be a positive integer (got ${process.env[name]})`,
    );
  }
  return parsed;
}
