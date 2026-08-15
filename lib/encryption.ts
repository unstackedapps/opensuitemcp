import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const MIN_CIPHERTEXT_BYTES = IV_LENGTH + AUTH_TAG_LENGTH + 1;
const BASE64_BLOB = /^[A-Za-z0-9+/]+={0,2}$/;

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

  const asBase64 = Buffer.from(key, "base64");
  if (asBase64.length === 32) {
    return asBase64;
  }

  const asUtf8 = Buffer.from(key, "utf8");
  if (asUtf8.length === 32) {
    return asUtf8;
  }

  // Other secret strings → stable 32-byte AES key
  return createHash("sha256").update(key).digest();
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

export type StoredSecret = {
  plaintext: string;
  encrypted: boolean;
};

function looksLikeCiphertext(value: string): boolean {
  if (value.includes(".") || !BASE64_BLOB.test(value)) {
    return false;
  }
  const combined = Buffer.from(value, "base64");
  if (combined.length < MIN_CIPHERTEXT_BYTES) {
    return false;
  }
  return combined.toString("base64") === value;
}

/**
 * Decrypt AES-256-GCM values written by encrypt().
 * Legacy plaintext (e.g. NetSuite JWTs stored before encryption) is returned
 * as-is so callers can re-encrypt on the next write.
 */
export function decryptStoredSecret(value: string): StoredSecret {
  if (!value) {
    return { plaintext: "", encrypted: false };
  }

  try {
    return { plaintext: decrypt(value), encrypted: true };
  } catch {
    if (looksLikeCiphertext(value)) {
      throw new Error(
        "Failed to decrypt stored secret. Check ENCRYPTION_KEY environment variable.",
      );
    }
    return { plaintext: value, encrypted: false };
  }
}
