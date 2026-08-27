import { createHmac, timingSafeEqual } from "node:crypto";

const LOGIN_PROOF_TTL_MS = 60_000;

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }
  return secret;
}

export function createNetSuiteLoginProof(
  userId: string,
  email: string,
): string {
  const exp = Date.now() + LOGIN_PROOF_TTL_MS;
  const payload = `${userId}:${email}:${exp}`;
  const signature = createHmac("sha256", getAuthSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}:${signature}`;
}

export function verifyNetSuiteLoginProof(
  proof: string,
): { userId: string; email: string } | null {
  const separatorIndex = proof.lastIndexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const payload = proof.slice(0, separatorIndex);
  const signature = proof.slice(separatorIndex + 1);
  const expectedSignature = createHmac("sha256", getAuthSecret())
    .update(payload)
    .digest("base64url");

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  const [userId, email, expRaw] = payload.split(":");
  if (!userId || !email || !expRaw) {
    return null;
  }

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    return null;
  }

  return { userId, email };
}
