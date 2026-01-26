import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get encryption key from environment variable
 * @throws Error if ENCRYPTION_KEY is not set
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. This is required for encrypting user data.",
    );
  }

  // If key is base64 encoded, decode it; otherwise use it directly
  try {
    return Buffer.from(key, "base64");
  } catch {
    // If not base64, treat as raw string and pad/truncate to 32 bytes
    const keyBuffer = Buffer.from(key, "utf-8");
    if (keyBuffer.length !== 32) {
      throw new Error(
        "ENCRYPTION_KEY must be 32 bytes. Use: openssl rand -base64 32",
      );
    }
    return keyBuffer;
  }
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @returns Encrypted data as base64 string (includes IV and auth tag)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    return "";
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Combine IV + authTag + encrypted data
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, "base64"),
  ]);

  return combined.toString("base64");
}

/**
 * Decrypt data that was encrypted with encrypt()
 * @param encryptedData - Base64 encoded encrypted data (includes IV and auth tag)
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    return "";
  }

  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, "base64");

  // Extract IV, auth tag, and encrypted data
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, "utf-8");
  decrypted += decipher.final("utf-8");

  return decrypted;
}
